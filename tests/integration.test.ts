// Integration tests against the *built* single-file translator. We load
// File Hierarchy.js (esbuild bundle with the JSON header stripped), run it
// inside a mocked Zotero via `new Function`, and drive doExport / detectImport
// / doImport exactly as the Zotero translator framework would.
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'
import { exportLibrary, loadLibraryFixture, readFixture, readFixtureRaw } from './helpers'
import { manifestToImportModel, normalizeCreators, validateManifest } from '../core'

const here = dirname(fileURLToPath(import.meta.url))
const translatorBody = readFileSync(join(here, '..', 'File Hierarchy.js'), 'utf-8').replace(
  /^\{[\s\S]*?\}\n\n/,
  '',
)

/** Run the translator once against a Zotero mock; entry points land on globalThis. */
function loadTranslator(zotero: any): void {
  new Function('Zotero', translatorBody)(zotero)
}

function makeZoteroExport(items: any[], roots: any[]) {
  const savedFiles: string[] = []
  let output = ''
  let itemIdx = 0
  let collIdx = 0
  const zotero = {
    debug: () => { /* mock */ },
    getOption: (name: string) => name === 'exportFileData',
    nextItem: () => (itemIdx < items.length ? items[itemIdx++] : false),
    nextCollection: () => (collIdx < roots.length ? roots[collIdx++] : false),
    write: (text: string) => {
      output = text
    },
  }
  // The export adapter calls attachment.saveFile(); inject a recorder.
  for (const item of items) {
    for (const att of item.attachments || []) {
      att.saveFile = (path: string) => {
        savedFiles.push(path)
      }
    }
  }
  return { zotero, savedFiles, output: () => output }
}

function makeZoteroImport(content: string) {
  const createdItems: any[] = []
  const createdCollections: any[] = []
  let offset = 0
  const zotero = {
    debug: () => { /* mock */ },
    read: (size: number) => {
      if (offset >= content.length) return false
      const chunk = content.slice(offset, offset + size)
      offset += chunk.length
      return chunk
    },
    Item: class {
      itemType: string
      attachments: { title: string; mimeType: string; path: string }[]
      complete: () => void
      constructor(itemType: string) {
        this.itemType = itemType
        this.attachments = []
        this.complete = () => {
          createdItems.push(this)
        }
      }
    },
    Collection: class {
      name = ''
      type = 'collection'
      children: { type: string; id: string }[] = []
      complete: () => void
      constructor() {
        this.complete = () => {
          createdCollections.push(this)
        }
      }
    },
  }
  return { zotero, createdItems, createdCollections }
}

describe('doExport', () => {
  it('writes the same manifest the pure pipeline produces and saves the files', () => {
    for (const name of [
      'basic',
      'chinese',
      'duplicate-filenames',
      'multi-collection',
      'nested-collections',
      'no-attachments',
      'two-attachments',
    ]) {
      const fixture = loadLibraryFixture(name)
      const expected = exportLibrary(fixture)
      const { zotero, savedFiles, output } = makeZoteroExport(fixture.items, fixture.roots)

      loadTranslator(zotero)
      ;(globalThis as any).doExport()

      const manifest = JSON.parse(output())
      expect(validateManifest(manifest)).toBe(true)
      expect(manifest).toEqual(expected.manifest)
      expect(savedFiles).toEqual(expected.savedPaths)
    }
  })

  it('throws when "Export File Data" is off', () => {
    const { zotero } = makeZoteroExport([], [])
    zotero.getOption = () => false
    loadTranslator(zotero)
    expect(() => (globalThis as any).doExport()).toThrow(/Export File Data/)
  })
})

describe('detectImport', () => {
  it('accepts a manifest written by this translator', () => {
    const { manifest } = exportLibrary(loadLibraryFixture('basic'))
    loadTranslator(makeZoteroImport(JSON.stringify(manifest)).zotero)
    expect((globalThis as any).detectImport()).toBe(true)
  })

  it('rejects malformed JSON', () => {
    loadTranslator(makeZoteroImport(readFixtureRaw('malformed')).zotero)
    expect((globalThis as any).detectImport()).toBe(false)
  })

  it('rejects valid JSON from another format', () => {
    loadTranslator(makeZoteroImport(JSON.stringify(readFixture('wrong-format'))).zotero)
    expect((globalThis as any).detectImport()).toBe(false)
  })

  it('rejects an incomplete manifest', () => {
    loadTranslator(makeZoteroImport(JSON.stringify(readFixture('incomplete'))).zotero)
    expect((globalThis as any).detectImport()).toBe(false)
  })
})

describe('doImport', () => {
  it('rebuilds an item with a stable key, metadata, creators, tags, notes, and attachment path', () => {
    const fixture = loadLibraryFixture('basic')
    const { manifest } = exportLibrary(fixture)
    const { zotero, createdItems, createdCollections } = makeZoteroImport(JSON.stringify(manifest))

    loadTranslator(zotero)
    ;(globalThis as any).doImport()

    expect(createdItems.length).toBe(manifest.items.length)
    expect(createdCollections.length).toBe(manifest.collections.length)

    const manifestItem = manifest.items[0]
    const item = createdItems.find((c: any) => c.itemID === manifestItem.key)!
    expect(item.itemType).toBe(manifestItem.itemType)
    expect(item.title).toBe(manifestItem.title)
    // Name-only creators are normalized to {fieldMode: 1, lastName} on import.
    expect(item.creators).toEqual(normalizeCreators((manifestItem.creators as unknown[]) || []))
    expect(item.tags).toEqual(manifestItem.tags)
    expect(item.notes).toEqual(manifestItem.notes)
    expect(item.attachments).toHaveLength(1)
    expect(item.attachments[0].path).toBe('Papers/Wang - 2025 - Example Paper.pdf')
  })

  it('wires nested collections and their members', () => {
    const fixture = loadLibraryFixture('nested-collections')
    const { manifest } = exportLibrary(fixture)
    const { zotero, createdItems, createdCollections } = makeZoteroImport(JSON.stringify(manifest))

    loadTranslator(zotero)
    ;(globalThis as any).doImport()

    const model = manifestToImportModel(manifest)
    expect(createdItems.length).toBe(fixture.items.length)
    expect(createdCollections.length).toBe(manifest.collections.length)

    // Keys are only reachable through the manifest (collection names are unique).
    const keyOf = (name: string) => manifest.collections.find(c => c.name === name)!.key
    const expectedChildren = (key: string) => [
      ...model.collections.filter(c => c.parentKey === key).map(c => ({ type: 'collection', id: c.key })),
      ...(model.collections.find(c => c.key === key)?.itemKeys || []).map(k => ({ type: 'item', id: k })),
    ]
    // Child order is an implementation detail; membership is what matters.
    const asSet = (arr: Array<{ type: string; id: string }>) =>
      new Set(arr.map(c => `${c.type}:${c.id}`))

    const byName = new Map(createdCollections.map((c: any) => [c.name, c]))
    expect(asSet(byName.get('A')!.children)).toEqual(asSet(expectedChildren(keyOf('A'))))
    expect(asSet(byName.get('B')!.children)).toEqual(asSet(expectedChildren(keyOf('B'))))
    expect(asSet(byName.get('C')!.children)).toEqual(asSet(expectedChildren(keyOf('C'))))

    // Every item re-created with itemID = manifest key and metadata intact.
    for (const m of manifest.items) {
      const item = createdItems.find((c: any) => c.itemID === m.key)!
      expect(item.title).toBe(m.title)
    }
  })

  it('throws for a payload that is not a manifest', () => {
    const { zotero } = makeZoteroImport(JSON.stringify(readFixture('wrong-format')))
    loadTranslator(zotero)
    expect(() => (globalThis as any).doImport()).toThrow(/Not a File Hierarchy Portable manifest/)
  })
})
