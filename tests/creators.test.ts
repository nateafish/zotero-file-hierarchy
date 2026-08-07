// Regression test for name-only (single-field) creators being silently dropped
// on import. Zotero's export format emits those as `{name, creatorType}`, and
// the import framework (Zotero.Translate.Sandbox.Base#_itemDone) removes any
// creator that has neither `firstName` nor `lastName`. normalizeCreators
// rewrites them to `{fieldMode: 1, lastName}` so they survive, and the test
// below simulates that exact framework step to prove it.
import { describe, it, expect } from 'vitest'
import { manifestToImportModel, normalizeCreators, type Manifest } from '../core'

const MANIFEST: Manifest = {
  format: 'zotero-file-hierarchy-portable',
  version: 1,
  collections: [],
  items: [
    {
      key: 'ITEM1',
      itemType: 'report',
      title: 'WHO Report',
      date: '2020',
      creators: [
        // Multi-field author: must pass through untouched.
        { creatorType: 'author', firstName: 'Jane', lastName: 'Doe' },
        // Single-field organizational author: the case that used to be dropped.
        { creatorType: 'author', name: 'World Health Organization' },
      ],
    },
  ],
}

/** Faithful copy of the creator-cleanup in Zotero's _itemDone. */
function frameworkCleanEmptyCreators(creators: any[]): any[] {
  const cleaned = creators.slice()
  for (let i = 0; i < cleaned.length; i++) {
    const creator = cleaned[i]
    if (!creator.firstName && !creator.lastName) {
      cleaned.splice(i, 1)
      i--
    }
  }
  return cleaned
}

describe('normalizeCreators', () => {
  it('rewrites name-only creators to {fieldMode: 1, lastName}', () => {
    expect(
      normalizeCreators([
        { creatorType: 'author', name: 'World Health Organization' },
      ]),
    ).toEqual([{ creatorType: 'author', fieldMode: 1, lastName: 'World Health Organization' }])
  })

  it('leaves multi-field creators untouched', () => {
    const multi = [{ creatorType: 'author', firstName: 'Jane', lastName: 'Doe' }]
    expect(normalizeCreators(multi)).toEqual(multi)
  })

  it('leaves already-legacy fieldMode-1 creators untouched', () => {
    const legacy = [{ creatorType: 'author', fieldMode: 1, lastName: 'WHO' }]
    expect(normalizeCreators(legacy)).toEqual(legacy)
  })

  it('drops empty/null entries without throwing', () => {
    expect(normalizeCreators([] as any[])).toEqual([])
    expect(normalizeCreators([null, undefined] as any[])).toEqual([null, undefined])
  })
})

describe('name-only creators survive the Zotero import framework', () => {
  it('the raw {name, creatorType} form is dropped (this is the bug)', () => {
    // Without normalization the framework removes the single-field creator...
    const creators = frameworkCleanEmptyCreators([
      { creatorType: 'author', name: 'World Health Organization' },
    ])
    expect(creators).toEqual([])
  })

  it('the normalized form survives (the fix)', () => {
    const normalized = normalizeCreators(
      MANIFEST.items[0].creators as any[],
    ) as Array<Record<string, any>>
    const survivors = frameworkCleanEmptyCreators(normalized)
    expect(survivors).toHaveLength(2)
    expect(survivors[1]).toEqual({
      creatorType: 'author',
      fieldMode: 1,
      lastName: 'World Health Organization',
    })
  })

  it('manifestToImportModel emits the normalized form for doImport to apply', () => {
    const model = manifestToImportModel(MANIFEST)
    const creators = model.items[0].creators as Array<Record<string, any>>
    expect(creators[0]).toEqual({ creatorType: 'author', firstName: 'Jane', lastName: 'Doe' })
    expect(creators[1]).toEqual({
      creatorType: 'author',
      fieldMode: 1,
      lastName: 'World Health Organization',
    })
    // And those survive the framework cleanup.
    expect(frameworkCleanEmptyCreators(creators)).toHaveLength(2)
  })
})
