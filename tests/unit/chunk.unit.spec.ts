// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { chunkText } from '@/lib/chunk'

describe('chunkText', () => {
  it('returns a single chunk for short text', () => {
    expect(chunkText('hello world', { chunkSize: 20 })).toEqual(['hello world'])
  })

  it('returns empty for blank input', () => {
    expect(chunkText('')).toEqual([])
    expect(chunkText('   \n  ')).toEqual([])
  })

  it('normalises newlines and collapses whitespace', () => {
    expect(chunkText('a\r\nb   c')).toEqual(['a b c'])
  })

  it('splits long text into chunks no larger than chunkSize', () => {
    expect(chunkText('a'.repeat(25), { chunkSize: 10, overlap: 0 })).toEqual([
      'a'.repeat(10),
      'a'.repeat(10),
      'a'.repeat(5),
    ])
  })

  it('overlaps consecutive chunks by the overlap size', () => {
    const chunks = chunkText('a'.repeat(25), { chunkSize: 10, overlap: 3 })
    expect(chunks.length).toBeGreaterThan(1)
    for (const chunk of chunks) expect(chunk.length).toBeLessThanOrEqual(10)
    for (let i = 0; i < chunks.length - 1; i++) {
      expect(chunks[i + 1].startsWith(chunks[i].slice(-3))).toBe(true)
    }
  })

  it('snaps boundaries to spaces so words are not split', () => {
    const text = 'one two three four five six seven eight nine'
    const words = new Set(text.split(' '))
    const chunks = chunkText(text, { chunkSize: 12, overlap: 0 })
    expect(chunks.length).toBeGreaterThan(1)
    // No chunk contains a partial word — every token is a whole word.
    for (const chunk of chunks) {
      for (const token of chunk.trim().split(' ')) {
        expect(words.has(token)).toBe(true)
      }
    }
  })

  it('splits by grapheme, not code unit (emoji kept whole)', () => {
    expect(chunkText('😀😀', { chunkSize: 1, overlap: 0 })).toEqual(['😀', '😀'])
  })
})
