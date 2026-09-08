import { describe, it, expect } from 'vitest'

import { extractTags } from '@/lib/site'
import { lexicalToPlainText } from '@/lib/lexical'

describe('extractTags', () => {
  it('returns a plain string array for valid tags', () => {
    const result = extractTags([{ tag: 'AI' }, { tag: 'Postgres' }])
    expect(result).toEqual(['AI', 'Postgres'])
  })

  it('drops null and empty tags', () => {
    const result = extractTags([{ tag: 'AI' }, { tag: null }, { tag: '' }, { tag: '  ' }])
    expect(result).toEqual(['AI'])
  })

  it('returns [] for undefined / null input', () => {
    expect(extractTags(undefined)).toEqual([])
    expect(extractTags(null)).toEqual([])
  })
})

describe('lexicalToPlainText', () => {
  it('extracts text recursively and collapses whitespace', () => {
    const doc = {
      root: {
        children: [
          { type: 'paragraph', children: [{ type: 'text', text: 'Hello' }] },
          { type: 'paragraph', children: [{ type: 'text', text: ' world' }] },
        ],
      },
    }
    expect(lexicalToPlainText(doc)).toBe('Hello world')
  })

  it('handles empty / invalid input', () => {
    expect(lexicalToPlainText(null)).toBe('')
    expect(lexicalToPlainText({})).toBe('')
  })
})
