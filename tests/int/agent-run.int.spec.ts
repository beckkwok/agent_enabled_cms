import { getPayload, type Payload } from 'payload'
import { beforeAll, describe, expect, it } from 'vitest'

import config from '@/payload.config'
import { runSingleShot } from '@/agents/run'
import { plainTextToLexical } from '@/lib/lexical'

let payload: Payload
let agentId: number

describe('agent run (integration)', () => {
  beforeAll(async () => {
    process.env.MOCK_LLM = '1'
    process.env.MOCK_EMBEDDINGS = '1'

    const payloadConfig = await config
    payload = await getPayload({ config: payloadConfig })

    const stamp = Date.now()

    const provider = await payload.create({
      collection: 'providers',
      data: {
        name: `test-openai-${stamp}`,
        provider: 'openai',
        models: [{ modelId: 'gpt-4o' }],
        apiKey: 'test-key',
        enabled: true,
      },
      overrideAccess: true,
    })

    const principal = await payload.create({
      collection: 'users',
      data: {
        email: `agent-principal-${stamp}@test.local`,
        password: 'test-password',
        name: 'Test Agent Principal',
        type: 'Agent',
      },
      overrideAccess: true,
    })

    const agent = await payload.create({
      collection: 'agents',
      data: {
        name: `Test Knowledge Agent ${stamp}`,
        kind: 'single-shot',
        status: 'active',
        runAccess: 'authenticated',
        capabilities: ['knowledge'],
        user: principal.id,
        provider: provider.id,
        model: 'gpt-4o',
        prompt: plainTextToLexical('You are a test agent. Answer from context.'),
      },
      overrideAccess: true,
    })

    agentId = agent.id
  })

  it('runs a single-shot agent and records an AgentRun + chat messages', async () => {
    const result = await runSingleShot({ payload, agentId, input: 'What is AACMS?' })

    expect(result.output).toBe('[mock agent response]')

    const run = await payload.findByID({
      collection: 'agent-runs',
      id: result.runId,
      depth: 0,
      overrideAccess: true,
    })
    expect(run.status).toBe('succeeded')
    expect(run.input).toBe('What is AACMS?')
    expect(run.agent).toBe(agentId)

    const messages = await payload.find({
      collection: 'chat-messages',
      where: { session: { equals: run.session } },
      overrideAccess: true,
    })
    expect(messages.totalDocs).toBe(2)

    const session = await payload.findByID({
      collection: 'chat-sessions',
      id: run.session as number,
      depth: 0,
      overrideAccess: true,
    })
    expect(session.agent).toBe(agentId)
  })

  it('rejects an unknown agent', async () => {
    await expect(runSingleShot({ payload, agentId: -1, input: 'nope' })).rejects.toBeTruthy()
  })

  it('runs via the Payload queue task and updates the AgentRun', async () => {
    const run = await payload.create({
      collection: 'agent-runs',
      data: { agent: agentId, status: 'queued', input: 'queued question', triggeredBy: 'queue' },
      overrideAccess: true,
    })

    await payload.jobs.queue({
      task: 'runAgent',
      input: { agentId, input: 'queued question', runId: run.id },
      overrideAccess: true,
    })

    await payload.jobs.run({ limit: 10 })

    const updated = await payload.findByID({
      collection: 'agent-runs',
      id: run.id,
      depth: 0,
      overrideAccess: true,
    })
    expect(updated.status).toBe('succeeded')
    expect(updated.output).toBe('[mock agent response]')
  })
})
