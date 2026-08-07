import { describe, it, expect } from 'vitest'
import {
  joinPath,
  normalizeRelativePath,
  resolveFilenameCollision,
  sanitizeFilename,
  splitFilename,
} from '../core'

describe('sanitizeFilename', () => {
  it('leaves plain filenames untouched', () => {
    expect(sanitizeFilename('Wang - 2025 - Example Paper.pdf')).toBe('Wang - 2025 - Example Paper.pdf')
  })

  it('percent-encodes every character that is illegal on common filesystems', () => {
    expect(sanitizeFilename('A/B:C*D?E"F<G>H|I$.pdf')).toBe('A%2FB%3AC%2AD%3FE%22F%3CG%3EH%7CI%24.pdf')
  })

  it('encodes backslashes and control characters', () => {
    expect(sanitizeFilename('a\\b\x00c')).toBe('a%5Cb%00c')
    expect(sanitizeFilename('tab\there')).toBe('tab%09here')
  })

  it('keeps CJK characters intact', () => {
    expect(sanitizeFilename('计算传播')).toBe('计算传播')
  })

  it('encodes an existing percent sign so output stays reversible-ish', () => {
    expect(sanitizeFilename('100% confirmed.pdf')).toBe('100%25 confirmed.pdf')
  })
})

describe('splitFilename', () => {
  it('splits base and extension at the last dot', () => {
    expect(splitFilename('paper.pdf')).toEqual(['paper', '.pdf'])
    expect(splitFilename('a.b.c.pdf')).toEqual(['a.b.c', '.pdf'])
  })

  it('handles files without, or with a trailing, dot', () => {
    expect(splitFilename('paper')).toEqual(['paper', ''])
    expect(splitFilename('paper.')).toEqual(['paper.', ''])
  })

  it('does not treat a leading dot as an extension separator', () => {
    expect(splitFilename('.gitignore')).toEqual(['.gitignore', ''])
  })
})

describe('joinPath', () => {
  it('joins segments with forward slashes', () => {
    expect(joinPath('a', 'b', 'c')).toBe('a/b/c')
  })

  it('normalizes backslashes', () => {
    expect(joinPath('a\\b', 'c')).toBe('a/b/c')
  })

  it('drops empty segments', () => {
    expect(joinPath('', 'a', '', 'b')).toBe('a/b')
    expect(joinPath('', '')).toBe('')
  })
})

describe('resolveFilenameCollision', () => {
  it('returns base+ext when the path is free', () => {
    const used = new Set<string>()
    expect(resolveFilenameCollision('papers/paper', '.pdf', used)).toBe('papers/paper.pdf')
    expect(used).toEqual(new Set(['papers/paper.pdf']))
  })

  it('appends _1, _2, ... on collisions', () => {
    const used = new Set<string>()
    expect(resolveFilenameCollision('papers/paper', '.pdf', used)).toBe('papers/paper.pdf')
    expect(resolveFilenameCollision('papers/paper', '.pdf', used)).toBe('papers/paper_1.pdf')
    expect(resolveFilenameCollision('papers/paper', '.pdf', used)).toBe('papers/paper_2.pdf')
  })

  it('treats collisions case-insensitively', () => {
    // The set is seeded with the lowercase path the resolver itself records.
    const used = new Set(['papers/paper.pdf'])
    expect(resolveFilenameCollision('papers/paper', '.PDF', used)).toBe('papers/paper_1.PDF')
  })

  it('keeps a same-base file with a different extension distinct', () => {
    const used = new Set<string>()
    expect(resolveFilenameCollision('papers/paper', '.html', used)).toBe('papers/paper.html')
    expect(resolveFilenameCollision('papers/paper', '.pdf', used)).toBe('papers/paper.pdf')
  })
})

describe('normalizeRelativePath', () => {
  it('converts backslashes to forward slashes', () => {
    expect(normalizeRelativePath('计算传播\\paper.pdf')).toBe('计算传播/paper.pdf')
    expect(normalizeRelativePath('a\\b\\c.pdf')).toBe('a/b/c.pdf')
  })

  it('strips a leading ./', () => {
    expect(normalizeRelativePath('./papers/a.pdf')).toBe('papers/a.pdf')
  })

  it('handles both at once (a Windows-style relative path)', () => {
    expect(normalizeRelativePath('.\\计算传播\\Wang - 2025 - Paper.pdf')).toBe('计算传播/Wang - 2025 - Paper.pdf')
  })

  it('leaves POSIX relative paths alone', () => {
    expect(normalizeRelativePath('Papers/a.pdf')).toBe('Papers/a.pdf')
  })
})
