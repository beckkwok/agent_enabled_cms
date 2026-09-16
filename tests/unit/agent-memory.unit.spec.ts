// @vitest-environment node
import { AIMessage, HumanMessage, SystemMessage } from '@langchain/core/messages'
import { describe, it, expect } from 'vitest'

import { loadSessionHistory } from '@/agents/memory'

function mockPayload(opts: { session?: unknown; messages?: unknown[] } = {}): never {
  return {
    find: async (args: { collection: string }) => {
      if (args.collection === 'chat-sessions') {
        return { docs: opts.session ? [opts.session] : [] }
      }
      return { docs: opts.messages ?? [] }
    },
  } as never
}

describe('loadSessionHistory', () => {
  it('returns [] when no sessionId is given', async () => {
    expect(await loadSessionHistory(mockPayload(), undefined)).toEqual([])
  })

  it('returns [] when the session does not exist', async () => {
    expect(await loadSessionHistory(mockPayload(), 'missing')).toEqual([])
  })

  it('maps roles to messages and returns them oldest → newest', async () => {
    const payload = mockPayload({
      session: { id: 1, sessionId: 's1' },
      // Payload returns most-recent-first (sort -createdAt); the loader reverses.
      messages: [
        { id: 3, role: 'assistant', content: 'Hi Ada' },
        { id: 2, role: 'system', content: 'sys' },
        { id: 1, role: 'user', content: 'my name is Ada' },
      ],
    })

    const history = await loadSessionHistory(payload, 's1')

    expect(history.map((m) => m.content)).toEqual(['my name is Ada', 'sys', 'Hi Ada'])
    expect(history[0]).toBeInstanceOf(HumanMessage)
    expect(history[1]).toBeInstanceOf(SystemMessage)
    expect(history[2]).toBeInstanceOf(AIMessage)
  })
})
