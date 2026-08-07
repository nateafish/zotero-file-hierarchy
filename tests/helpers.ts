// Shared helpers: load fixtures, simulate the export pipeline with the pure
// core functions, and assert the round-trip invariants between a library-state
// fixture and the import model derived from the exported manifest.
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect } from 'vitest'
import {
  buildAttachmentExports,
  buildCollectionRecords,
  buildManifest,
  manifestToImportModel,
  normalizeRelativePath,
  type CollectionNode,
  type Manifest,
  type ManifestItem,
} from '../core'

const here = dirname(fileURLToPath(import.meta.url))
const fixtureDir = join(here, 'fixtures')

export interface LibraryFixture {
  roots: CollectionNode[]
  items: any[]
}

export function fixturePath(name: string): string {
  return join(fixtureDir, `${name}.json`)
}

/** Read any fixture as parsed JSON (library-state or manifest-shaped). */
export function readFixture(name: string): any {
  return JSON.parse(readFileSync(fixturePath(name), 'utf-8'))
}

/** Read any fixture as raw text (needed for the malformed-JSON case). */
export function readFixtureRaw(name: string): string {
  return readFileSync(fixturePath(name), 'utf-8')
}

export function loadLibraryFixture(name: string): LibraryFixture {
  return readFixture(name) as LibraryFixture
}

/**
 * Simulate exactly what doExport does, but with the pure core functions:
 * collection records -> per-item attachment export plans -> manifest.
 * Returns the manifest plus the relative paths that would have been saved.
 */
export function exportLibrary(fixture: LibraryFixture): { manifest: Manifest; savedPaths: string[] } {
  const collectionRecords = buildCollectionRecords(fixture.roots)
  const collectionPaths = new Map(collectionRecords.map(r => [r.key, r.path]))
  const usedPaths = new Set<string>()
  const savedPaths: string[] = []

  const items: ManifestItem[] = fixture.items.map(item => {
    const data: ManifestItem = JSON.parse(JSON.stringify(item))
    const attachmentExports = buildAttachmentExports(item, collectionPaths, usedPaths)
    for (const exportEntry of attachmentExports) savedPaths.push(...exportEntry.paths)
    data.attachments = attachmentExports
    return data
  })

  return { manifest: buildManifest(items, collectionRecords), savedPaths }
}

/**
 * Stable identity across the round trip: DOI when present, else
 * title + extracted year + first creator. Works on library-state items
 * (fields at the top level) and on import-model items (fields nested,
 * creators still at the top level).
 */
export function matchKey(item: any): string {
  const doi = item.DOI ?? item.fields?.DOI
  if (doi) return `doi:${doi}`
  const year = String(item.date ?? item.fields?.date ?? '').match(/\d{4}/)?.[0] || ''
  const first = (item.creators || [])[0]
  const firstCreator = first ? `${first.lastName || ''}${first.firstName || ''}` : ''
  return `ref:${item.title ?? item.fields?.title ?? ''}|${year}|${firstCreator}`
}

const SKIP_FIELDS = new Set([
  'key', 'itemID', 'libraryID', 'collections', 'attachments', 'creators', 'tags',
  'notes', 'relations', 'seeAlso', 'dateAdded', 'dateModified', 'itemType',
])

/** The scalar fields of a library-state item, coerced exactly like the importer. */
export function fieldsOf(item: any): Record<string, string> {
  const fields: Record<string, string> = {}
  for (const [field, value] of Object.entries(item)) {
    if (SKIP_FIELDS.has(field)) continue
    if (value === null || value === undefined) continue
    if (typeof value === 'object') continue
    fields[field] = String(value)
  }
  return fields
}

/**
 * Assert every round-trip invariant for a library-state fixture given the
 * manifest its export produced. Item identity uses matchKey, so the freshly
 * minted Zotero keys on import never enter the comparison.
 */
export function expectRoundTrip(manifest: Manifest, fixture: LibraryFixture): void {
  const model = manifestToImportModel(manifest)
  const expectedCollections = buildCollectionRecords(fixture.roots)

  // Collection tree survives: records == depth-first flattening of the tree.
  expect(manifest.collections).toEqual(expectedCollections)
  expect(model.collections.map(c => c.key)).toEqual(expectedCollections.map(c => c.key))

  // Item counts survive.
  expect(manifest.items.length).toBe(fixture.items.length)
  expect(model.items.length).toBe(fixture.items.length)

  const sourceByKey = new Map(fixture.items.map(item => [matchKey(item), item]))
  const exportedByKey = new Map(manifest.items.map(item => [matchKey(item), item]))

  for (const imported of model.items) {
    const source = sourceByKey.get(matchKey(imported))
    const exported = exportedByKey.get(matchKey(imported))
    expect(source, 'every imported item must map back to a fixture item').toBeTruthy()
    expect(exported, 'every fixture item must appear in the manifest').toBeTruthy()

    // Bibliographic metadata (internal Zotero keys excluded).
    expect(imported.fields).toEqual(fieldsOf(source))

    // Creators / tags / notes survive verbatim.
    expect(imported.creators).toEqual(source.creators || [])
    expect(imported.tags).toEqual(source.tags || [])
    expect(imported.notes).toEqual(source.notes || [])

    // Collection membership survives (keys unknown to the manifest are dropped).
    const manifestKeys = new Set(manifest.collections.map(c => c.key))
    expect(imported.collectionKeys).toEqual(
      (source.collections || []).filter((key: string) => manifestKeys.has(key)),
    )

    // One import attachment per file attachment, at relative paths[0].
    const sourceFiles = (source.attachments || []).filter((att: any) => att.defaultPath)
    const exportedAttachments = (exported.attachments || []) as Array<{
      title: string
      mimeType: string
      paths: string[]
    }>
    expect(imported.attachments.length).toBe(sourceFiles.length)
    expect(exportedAttachments.length).toBe(sourceFiles.length)
    imported.attachments.forEach((att, i) => {
      const sourceAtt = sourceFiles[i]
      expect(att.title).toBe(sourceAtt.title)
      expect(att.mimeType).toBe(sourceAtt.mimeType || sourceAtt.contentType || '')
      expect(exportedAttachments[i].paths.length).toBeGreaterThan(0)
      expect(att.path).toBe(normalizeRelativePath(exportedAttachments[i].paths[0]))
    })
  }

  // Per-collection membership (itemKeys) is consistent in both directions.
  for (const coll of expectedCollections) {
    const expectedKeys = fixture.items
      .filter(item => (item.collections || []).includes(coll.key))
      .map(item => item.key)
    const actual = model.collections.find(c => c.key === coll.key)!
    expect(new Set(actual.itemKeys)).toEqual(new Set(expectedKeys))
  }

  // No two exported relative paths collide (collision resolution kept them apart).
  const allPaths = manifest.items.flatMap(item =>
    ((item.attachments || []) as Array<{ paths: string[] }>).flatMap(att => att.paths),
  )
  expect(new Set(allPaths).size).toBe(allPaths.length)
}
