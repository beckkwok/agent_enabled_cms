// @vitest-environment node
import { getPayload, type Payload } from 'payload'
import { beforeAll, describe, expect, it } from 'vitest'

import config from '@/payload.config'
import { buildRunContext } from '@/agents/run'
import { runSkill } from '@/agents/skills/authorize'
import { SKILLS } from '@/agents/skills'
import { plainTextToLexical } from '@/lib/lexical'
import { maybeSummarizeSession, searchMemory } from '@/lib/agent-memory'

let payload: Payload
const stamp = Date.now()

async function makePrincipal(suffix: string) {
  return payload.create({
    collection: 'users',
    data: {
      email: `mem-${suffix}-${stamp}@test.local`,
      password: 'test-password',
      name: `Mem ${suffix}`,
      type: 'Agent',
    },
    overrideAccess: true,
  })
}

async function makeAgent(name: string, principalId: number, capabilities: ('knowledge' | 'memory')[] = []) {
  return payload.create({
    collection: 'agents',
    data: {
      name: `${name}-${stamp}`,
      kind: 'single-shot',
      status: 'active',
      runAccess: 'authenticated',
      capabilities,
      tools: [],
      user: principalId,
      prompt: plainTextToLexical('test agent'),
    },
    overrideAccess: true,
  })
}

describe('long-term memory (integration)', () => {
  beforeAll(async () => {
    process.env.MOCK_EMBEDDINGS = '1'
    process.env.MOCK_LLM = '1'
    payload = await getPayload({ config: await config })
  })

  it('saveMemory skill writes an owned, indexed memory that searchMemory retrieves', async () => {
    const principal = await makePrincipal('a')
    const agent = await makeAgent('A', principal.id, ['memory'])

    const result = (await runSkill(
      SKILLS.saveMemory,
      { content: 'The customer prefers email contact.', kind: 'preference' },
      { payload, user: principal },
    )) as { id?: number; error?: string }

    expect(result.id).toBeTruthy()
    expect(result.error).toBeUndefined()

    await payload.jobs.run({ limit: 10 })

    const results = await searchMemory(payload, agent.id, 'contact preference', {
      user: principal as never,
    })
    expect(results.some((r) => r.content.includes('email contact'))).toBe(true)
  })

  it('searchMemory is agent-scoped and access-controlled', async () => {
    const pA = await makePrincipal('sa')
    const agentA = await makeAgent('SA', pA.id, ['memory'])
    const pB = await makePrincipal('sb')
    await makeAgent('SB', pB.id, ['memory'])

    await runSkill(
      SKILLS.saveMemory,
      { content: 'Agent A secret fact', kind: 'fact' },
      { payload, user: pA },
    )
    await payload.jobs.run({ limit: 10 })

    const asA = await searchMemory(payload, agentA.id, 'secret fact', {
      user: pA as never,
    })
    expect(asA.some((r) => r.content.includes('secret fact'))).toBe(true)

    const asB = await searchMemory(payload, agentA.id, 'secret fact', {
      user: pB as never,
    })
    expect(asB).toHaveLength(0)
  })

  it('memory capability injects long-term memory into the run context', async () => {
    const p = await makePrincipal('ctx')
    const agent = await makeAgent('CTX', p.id, ['memory'])

    await runSkill(
      SKILLS.saveMemory,
      { content: 'The user likes terse answers.', kind: 'preference' },
      { payload, user: p },
    )
    await payload.jobs.run({ limit: 10 })

    const { systemContent } = await buildRunContext(payload, agent.id, 'answer preference', undefined)
    expect(systemContent).toContain('Long-term memory:')
    expect(systemContent).toContain('terse answers')
  })

  it('maybeSummarizeSession compacts a long session into a summary memory', async () => {
    const p = await makePrincipal('sum')
    const agent = await makeAgent('SUM', p.id, ['memory'])

    const session = await payload.create({
      collection: 'chat-sessions',
      data: { sessionId: `sum-${stamp}`, agent: agent.id },
      overrideAccess: true,
    })
    for (let i = 0; i < 12; i++) {
      await payload.create({
        collection: 'chat-messages',
        data: {
          session: session.id,
          role: i % 2 ? 'assistant' : 'user',
          content: `message ${i}`,
        },
        overrideAccess: true,
      })
    }

    await maybeSummarizeSession(payload, agent.id, session.sessionId)

    const marked = await payload.findByID({
      collection: 'chat-sessions',
      id: session.id,
      depth: 0,
      overrideAccess: true,
    })
    expect(marked.summarizedCount).toBe(12)

    await payload.jobs.run({ limit: 10 })

    const mems = await payload.find({
      collection: 'agent-memories',
      where: { agent: { equals: agent.id } },
      limit: 10,
      depth: 0,
      overrideAccess: true,
    })
    expect(mems.docs.some((m) => m.kind === 'summary')).toBe(true)
  })
})
