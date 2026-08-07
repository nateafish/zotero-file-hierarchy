// The built translator embeds native Zotero test cases (Scaffold / test/tests
// read them from the body). Verify they are consistent with the fixtures they
// were generated from: every input is a valid manifest and the expected items
// line up with the fixture items.
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'
import { validateManifest } from '../core'
import { loadLibraryFixture } from './helpers'

const here = dirname(fileURLToPath(import.meta.url))
const src = readFileSync(join(here, '..', 'File Hierarchy.js'), 'utf-8')
const body = src.replace(/^\{[\s\S]*?\}\n\n/, '')

const GENERATED_FIXTURES = [
  'basic',
  'chinese',
  'nested-collections',
  'duplicate-filenames',
  'tags-notes',
]

function extractTestCases(): any[] {
  const m = body.match(
    /\/\*\* BEGIN TEST CASES \*\*\/\s*var testCases = (\[[\s\S]*\])\s*\/\*\* END TEST CASES \*\*\//,
  )
  if (!m) throw new Error('no test cases embedded in File Hierarchy.js')
  return JSON.parse(m[1])
}

describe('embedded native test cases', () => {
  it('every input is a valid manifest whose items match the expected items', () => {
    const cases = extractTestCases()
    expect(cases.length).toBe(GENERATED_FIXTURES.length)

    for (const tc of cases) {
      expect(tc.type).toBe('import')
      expect(typeof tc.input).toBe('string')
      expect(Array.isArray(tc.items)).toBe(true)

      const manifest = JSON.parse(tc.input)
      expect(validateManifest(manifest)).toBe(true)
      expect(tc.items.length).toBe(manifest.items.length)

      // Expected items (bibliographic fields) must correspond 1:1 to manifest items.
      const manifestDOIs = manifest.items.map((item: any) => item.DOI)
      for (const item of tc.items) {
        expect(manifestDOIs).toContain(item.DOI)
      }
    }
  })

  it('covers each chosen fixture with the right item count', () => {
    const cases = extractTestCases()
    for (const name of GENERATED_FIXTURES) {
      const fixture = loadLibraryFixture(name)
      // Some fixtures share DOIs (basic and duplicate-filenames both use
      // 10.1234/example), so match on the exact DOI set.
      const fixtureDOIs = new Set(fixture.items.map((item: any) => item.DOI))
      const tc = cases.find(testCase => {
        const caseDOIs = new Set(
          JSON.parse(testCase.input).items.map((item: any) => item.DOI),
        )
        return (
          caseDOIs.size === fixtureDOIs.size && [...fixtureDOIs].every(doi => caseDOIs.has(doi))
        )
      })
      expect(tc, `fixture "${name}" should have a generated test case`).toBeTruthy()
      expect(tc!.items.length).toBe(fixture.items.length)
    }
  })
})
