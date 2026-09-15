// @vitest-environment node
import { describe, it, expect } from 'vitest'

import { SKILL_NAMES, getSkill } from '@/agents/skills'
import { buildAgentTools } from '@/agents/skills/langchain'

describe('skill registry', () => {
  it('exposes the framework skills', () => {
    expect(SKILL_NAMES).toEqual(
      expect.arrayContaining(['searchKnowledge', 'listContent', 'getContent', 'countContent']),
    )
  })

  it('getSkill returns a skill by name', () => {
    expect(getSkill('listContent')?.name).toBe('listContent')
    expect(getSkill('nope')).toBeUndefined()
  })
})

describe('buildAgentTools', () => {
  it('builds tools for known names and ignores unknown', () => {
    const tools = buildAgentTools(['listContent', 'doesNotExist'], { payload: {} as never })
    expect(tools.map((t) => t.name)).toEqual(['listContent'])
  })

  it('invokes the underlying skill handler', async () => {
    const payload = { find: async () => ({ docs: [], totalDocs: 7 }) } as never
    const tools = buildAgentTools(['countContent'], { payload })
    const result = await tools[0].invoke({})
    expect(JSON.parse(result as string)).toEqual({ totalDocs: 7 })
  })

  it('passes overrideAccess:false and the acting user to Payload (access control)', async () => {
    const calls: unknown[] = []
    const user = { id: 42, collection: 'users', type: 'Agent' }
    const payload = {
      find: async (args: unknown) => {
        calls.push(args)
        return { docs: [], totalDocs: 0 }
      },
    } as never

    const tools = buildAgentTools(['listContent'], { payload, user: user as never })
    await tools[0].invoke({ limit: 3 })

    expect(calls).toHaveLength(1)
    const args = calls[0] as { overrideAccess: boolean; user: unknown }
    expect(args.overrideAccess).toBe(false)
    expect(args.user).toBe(user)
  })
})
