// Derive native Zotero import test cases from the round-trip fixtures, using
// the same pure core functions the translator runs. The output is embedded in
// the built translator body by header.js, so the `testCases` the Zotero test
// framework (Scaffold, test/tests) runs never drift from the fixtures.
//
// Test-case schema (see chrome/content/zotero/xpcom/translate/testTranslators/):
//   { "type": "import", "input": <manifest JSON string>, "items": [expected] }
// The harness compares only real bibliographic item fields — creators, tags,
// notes, attachments, collections, and all internal Zotero keys are ignored —
// so the expected items carry just those fields.
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  buildAttachmentExports,
  buildCollectionRecords,
  buildManifest,
} from '../core'

const ROOT = process.cwd()
const FIXTURE_DIR = join(ROOT, 'tests', 'fixtures')
// The subset of library fixtures that become native test cases. Keep it to the
// cases a real Zotero import must get right: plain item, CJK, multi-item
// hierarchy, filename collision, and tags/notes passthrough.
const FIXTURES = [
  'basic',
  'chinese',
  'nested-collections',
  'duplicate-filenames',
  'tags-notes',
]

// Same set core.ts's importer drops; the test harness drops these too.
const SKIP_FIELDS = new Set([
  'key', 'itemID', 'libraryID', 'collections', 'attachments', 'creators', 'tags',
  'notes', 'relations', 'seeAlso', 'dateAdded', 'dateModified', 'itemType',
])

function buildManifestFor(fixture: any): any {
  const collectionRecords = buildCollectionRecords(fixture.roots)
  const collectionPaths = new Map(collectionRecords.map(r => [r.key, r.path]))
  const usedPaths = new Set<string>()
  const items = fixture.items.map((item: any) => {
    const data: any = JSON.parse(JSON.stringify(item))
    data.attachments = buildAttachmentExports(item, collectionPaths, usedPaths)
    return data
  })
  return buildManifest(items, collectionRecords)
}

function expectedItem(fixtureItem: any): Record<string, string> {
  const item: Record<string, string> = { itemType: fixtureItem.itemType }
  for (const [field, value] of Object.entries(fixtureItem)) {
    if (SKIP_FIELDS.has(field)) continue
    if (value === null || value === undefined) continue
    if (typeof value === 'object') continue
    item[field] = String(value)
  }
  return item
}

const testCases = FIXTURES.map(name => {
  const fixture = JSON.parse(readFileSync(join(FIXTURE_DIR, `${name}.json`), 'utf-8'))
  return {
    type: 'import',
    input: JSON.stringify(buildManifestFor(fixture)),
    items: fixture.items.map(expectedItem),
  }
})

const outPath = join(ROOT, 'tests', 'generated-test-cases.json')
writeFileSync(outPath, JSON.stringify(testCases, null, 2) + '\n')
console.log(`Wrote ${testCases.length} native import test cases to ${outPath}`)
