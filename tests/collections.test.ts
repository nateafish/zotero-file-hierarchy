import { describe, it, expect } from 'vitest'
import { buildCollectionRecords } from '../core'

describe('buildCollectionRecords', () => {
  it('flattens a nested tree depth-first with hierarchical paths', () => {
    const records = buildCollectionRecords([
      {
        key: 'A',
        name: 'a',
        type: 'collection',
        children: [
          {
            key: 'B',
            name: 'b',
            type: 'collection',
            children: [{ key: 'C', name: 'c', type: 'collection', children: [] }],
          },
        ],
      },
    ])
    expect(records).toEqual([
      { key: 'A', name: 'a', parentKey: null, path: 'a' },
      { key: 'B', name: 'b', parentKey: 'A', path: 'a/b' },
      { key: 'C', name: 'c', parentKey: 'B', path: 'a/b/c' },
    ])
  })

  it('sanitizes each path segment', () => {
    const records = buildCollectionRecords([{ key: 'A', name: 'R&D/2025', children: [] }])
    expect(records[0].path).toBe('R&D%2F2025')
  })

  it('skips non-collection children (items, saved searches)', () => {
    const records = buildCollectionRecords([
      {
        key: 'A',
        name: 'a',
        children: [
          { key: 'X', name: 'x', type: 'item' },
          { key: 'Y', name: 'y', type: 'search' },
        ],
      },
    ])
    expect(records).toEqual([{ key: 'A', name: 'a', parentKey: null, path: 'a' }])
  })

  it('handles an empty tree', () => {
    expect(buildCollectionRecords([])).toEqual([])
  })

  it('handles siblings and multiple roots', () => {
    const records = buildCollectionRecords([
      { key: 'A', name: 'a', children: [{ key: 'A2', name: 'a2', type: 'collection', children: [] }] },
      { key: 'B', name: 'b', children: [] },
    ])
    expect(records.map(r => r.path)).toEqual(['a', 'a/a2', 'b'])
    expect(records.map(r => r.parentKey)).toEqual([null, 'A', null])
  })
})
