import { describe, it, expect } from 'vitest'

import { agentPromptToText } from '@/agents/prompt'

describe('agentPromptToText', () => {
  it('extracts text from a lexical prompt', () => {
    const prompt = {
      root: {
        children: [
          { type: 'paragraph', children: [{ type: 'text', text: 'You are a helpful' }] },
          { type: 'paragraph', children: [{ type: 'text', text: ' assistant.' }] },
        ],
      },
    } as never

    expect(agentPromptToText(prompt)).toBe('You are a helpful assistant.')
  })

  it('returns empty string for null/undefined', () => {
    expect(agentPromptToText(null)).toBe('')
    expect(agentPromptToText(undefined)).toBe('')
  })

  it('returns empty string for malformed input', () => {
    expect(agentPromptToText({} as never)).toBe('')
  })
})
