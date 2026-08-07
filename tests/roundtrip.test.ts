import { describe, it, expect } from 'vitest'
import { exportLibrary, expectRoundTrip, loadLibraryFixture } from './helpers'
import { validateManifest } from '../core'

// Library-state fixtures: each one simulates a Zotero library at export time
// and drives the full export -> manifest -> import pipeline end to end.
const LIBRARY_FIXTURES = [
  'basic',
  'chinese',
  'invalid-characters',
  'long-title',
  'duplicate-filenames',
  'multi-collection',
  'nested-collections',
  'no-attachments',
  'two-attachments',
  'tags-notes',
  'doi-url',
  'empty-collection',
]

describe.each(LIBRARY_FIXTURES)('round-trip: %s', name => {
  it('preserves every invariant through export and import', () => {
    const fixture = loadLibraryFixture(name)
    const { manifest } = exportLibrary(fixture)
    expect(validateManifest(manifest)).toBe(true)
    expectRoundTrip(manifest, fixture)
  })
})
