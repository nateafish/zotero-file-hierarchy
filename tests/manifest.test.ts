import { describe, it, expect } from 'vitest'
import { readFixture } from './helpers'
import {
  buildManifest,
  FORMAT,
  manifestToImportModel,
  VERSION,
  validateManifest,
} from '../core'

describe('buildManifest', () => {
  it('stamps the format and version', () => {
    const manifest = buildManifest([], [])
    expect(manifest.format).toBe(FORMAT)
    expect(manifest.version).toBe(VERSION)
    expect(manifest.collections).toEqual([])
    expect(manifest.items).toEqual([])
  })
})

describe('validateManifest', () => {
  it('accepts a manifest written by this translator', () => {
    expect(validateManifest(readFixture('windows-paths'))).toBe(true)
  })

  it('rejects JSON from another format', () => {
    expect(validateManifest(readFixture('wrong-format'))).toBe(false)
  })

  it('rejects an incomplete manifest (missing items)', () => {
    expect(validateManifest(readFixture('incomplete'))).toBe(false)
  })

  it('rejects non-objects and objects without the right shape', () => {
    expect(validateManifest(null)).toBe(false)
    expect(validateManifest(undefined)).toBe(false)
    expect(validateManifest('string')).toBe(false)
    expect(validateManifest(42)).toBe(false)
    expect(validateManifest({})).toBe(false)
    expect(validateManifest({ format: FORMAT })).toBe(false)
  })
})

describe('manifestToImportModel', () => {
  it('normalizes Windows attachment paths to forward slashes', () => {
    const model = manifestToImportModel(readFixture('windows-paths'))
    expect(model.items[0].attachments[0].path).toBe('计算传播/Win - 2023 - Windows Paths.pdf')
  })

  it('drops attachment entries that carry no usable paths', () => {
    const manifest = {
      format: FORMAT,
      version: VERSION,
      collections: [],
      items: [
        {
          key: 'I1',
          itemType: 'journalArticle',
          title: 'x',
          attachments: [
            { title: 'ok', paths: ['a/b.pdf'] },
            { title: 'no paths' },
            { title: 'empty paths', paths: [] },
            { title: 'null paths', paths: null },
          ],
        },
      ],
    }
    const model = manifestToImportModel(manifest as any)
    expect(model.items[0].attachments).toEqual([{ title: 'ok', mimeType: '', path: 'a/b.pdf' }])
  })

  it('coerces scalar fields to strings and drops internal Zotero fields', () => {
    const manifest = {
      format: FORMAT,
      version: VERSION,
      collections: [],
      items: [
        {
          key: 'I1',
          itemType: 'journalArticle',
          title: 'x',
          DOI: '10.1/x',
          volume: 5,
          itemID: 999,
          libraryID: 1,
          collections: ['NOPE'],
          creators: [{ creatorType: 'author', lastName: 'A', firstName: '' }],
          dateAdded: '2020-01-01 00:00:00',
          relations: {},
        },
      ],
    }
    const model = manifestToImportModel(manifest as any)
    expect(model.items[0].fields).toEqual({ title: 'x', DOI: '10.1/x', volume: '5' })
  })

  it('filters collection membership to known collections and fills itemKeys', () => {
    const manifest = {
      format: FORMAT,
      version: VERSION,
      collections: [
        { key: 'A', name: 'a', parentKey: null, path: 'a' },
        { key: 'B', name: 'b', parentKey: null, path: 'b' },
      ],
      items: [{ key: 'I1', itemType: 'journalArticle', title: 'x', collections: ['A', 'B', 'GHOST'] }],
    }
    const model = manifestToImportModel(manifest as any)
    expect(model.items[0].collectionKeys).toEqual(['A', 'B'])
    expect(model.collections[0].itemKeys).toEqual(['I1'])
    expect(model.collections[1].itemKeys).toEqual(['I1'])
  })

  it('falls back to a synthesized key when the manifest omits one', () => {
    const manifest = {
      format: FORMAT,
      version: VERSION,
      collections: [],
      items: [{ itemType: 'journalArticle', title: 'x' }],
    }
    const model = manifestToImportModel(manifest as any)
    expect(model.items[0].key).toBe('imported-0')
  })
})
