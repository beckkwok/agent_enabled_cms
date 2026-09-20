// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { rrfFuse } from '@/lib/rrf'

describe('rrfFuse', () => {
  it('merges arms and orders by descending score', () => {
    const result = rrfFuse([
      { candidates: [{ key: 1, content: 'a' }, { key: 2, content: 'b' }] },
      { candidates: [{ key: 2, content: 'b' }] },
    ])
    // key2 = 1/62 + 1/61 > key1 = 1/61, so key2 ranks first.
    expect(result.map((r) => r.key)).toEqual([2, 1])
  })

  it('accumulates score for candidates present in both arms', () => {
    const result = rrfFuse([
      { candidates: [{ key: 1, content: 'a' }, { key: 2, content: 'b' }] },
      { candidates: [{ key: 2, content: 'b' }, { key: 1, content: 'a' }] },
    ])
    expect(result).toHaveLength(2)
    expect(result.map((r) => r.key).sort()).toEqual([1, 2])
  })

  it('scores by weight / (k + rank)', () => {
    const result = rrfFuse([{ candidates: [{ key: 1, content: 'a' }] }], { k: 0 })
    expect(result[0].similarity).toBe(1)
  })

  it('biases ranking by arm weight', () => {
    const result = rrfFuse(
      [
        { candidates: [{ key: 1, content: 'a' }], weight: 2 },
        { candidates: [{ key: 2, content: 'b' }], weight: 1 },
      ],
      { limit: 2 },
    )
    expect(result[0].key).toBe(1)
  })

  it('respects limit', () => {
    const result = rrfFuse(
      [{ candidates: [{ key: 1, content: 'a' }, { key: 2, content: 'b' }, { key: 3, content: 'c' }] }],
      { limit: 2 },
    )
    expect(result).toHaveLength(2)
  })

  it('filters by minSimilarity', () => {
    const result = rrfFuse([{ candidates: [{ key: 1, content: 'a' }] }], { minSimilarity: 1 })
    expect(result).toHaveLength(0)
  })

  it('carries meta through the fusion', () => {
    const result = rrfFuse<number>([{ candidates: [{ key: 1, content: 'a', meta: 42 }] }])
    expect(result[0].meta).toBe(42)
  })
})
