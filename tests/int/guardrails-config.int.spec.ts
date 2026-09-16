// @vitest-environment node
import { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { AIMessage, type BaseMessage } from '@langchain/core/messages'
import type { ChatResult } from '@langchain/core/outputs'
import { getPayload, type Payload } from 'payload'
import { beforeAll, describe, expect, it } from 'vitest'

import config from '@/payload.config'
import { runSingleShot } from '@/agents/run'
import { GuardrailError } from '@/agents/guardrails'
import { plainTextToLexical } from '@/lib/lexical'

class FixedModel extends BaseChatModel {
  constructor(private readonly text: string) {
    super({})
  }
  _llmType(): string {
    return 'fixed'
  }
  async _generate(_messages: BaseMessage[]): Promise<ChatResult> {
    return { generations: [{ text: this.text, message: new AIMessage(this.text) }] }
  }
}

let payload: Payload
let principalId: number
const stamp = Date.now()
const SECRET = 'secret-value-123456'

async function createAgent(safetyMode: 'off' | 'monitor' | 'enforce'): Promise<number> {
  const agent = await payload.create({
    collection: 'agents',
    data: {
      name: `Cfg Guardrail Agent ${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      kind: 'single-shot',
      status: 'active',
      runAccess: 'authenticated',
      safetyMode,
      capabilities: [],
      tools: [],
      user: principalId,
      prompt: plainTextToLexical('test agent'),
    },
    overrideAccess: true,
  })
  return agent.id
}

async function latestRun(agentId: number) {
  const runs = await payload.find({
    collection: 'agent-runs',
    where: { agent: { equals: agentId } },
    sort: '-createdAt',
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  return runs.docs[0]
}

describe('configurable guardrails (integration)', () => {
  beforeAll(async () => {
    process.env.MOCK_LLM = '1'
    process.env.MOCK_EMBEDDINGS = '1'
    payload = await getPayload({ config: await config })

    const principal = await payload.create({
      collection: 'users',
      data: {
        email: `cfg-guardrail-${stamp}@test.local`,
        password: 'test-password',
        name: 'Cfg Guardrail Principal',
        type: 'Agent',
      },
      overrideAccess: true,
    })
    principalId = principal.id

    // A configured provider secret the engine should redact by exact match.
    await payload.create({
      collection: 'providers',
      data: {
        name: `cfg-provider-${stamp}`,
        provider: 'openai',
        models: [{ modelId: 'gpt-4o' }],
        apiKey: SECRET,
        enabled: true,
      },
      overrideAccess: true,
    })
  })

  it('redacts a configured provider secret from output (provider-agnostic)', async () => {
    const agentId = await createAgent('monitor')
    const result = await runSingleShot({
      payload,
      agentId,
      input: 'what is the key?',
      model: new FixedModel(`Here is the key ${SECRET}`),
    })
    expect(result.output).toContain('[REDACTED]')
    expect(result.output).not.toContain(SECRET)

    const run = await latestRun(agentId)
    expect(run.flagged).toBe(true)
    expect(run.flagReasons).toContain('configured-secret')
  })

  it('blocks input matching a custom block rule in enforce mode', async () => {
    await payload.create({
      collection: 'guardrails',
      data: {
        name: `bank-acct-${stamp}`,
        enabled: true,
        direction: 'input',
        action: 'block',
        pattern: '\\b\\d{8}\\b',
      },
      overrideAccess: true,
    })

    const agentId = await createAgent('enforce')
    await expect(
      runSingleShot({ payload, agentId, input: 'my account is 12345678', model: new FixedModel('x') }),
    ).rejects.toBeInstanceOf(GuardrailError)

    const run = await latestRun(agentId)
    expect(run.status).toBe('failed')
    expect(run.flagReasons).toContain('custom:bank-acct')
  })

  it('redacts output matching a custom redact rule', async () => {
    await payload.create({
      collection: 'guardrails',
      data: {
        name: `mask-${stamp}`,
        enabled: true,
        direction: 'output',
        action: 'redact',
        pattern: '\\d{8}',
        replacement: '[ACCT]',
      },
      overrideAccess: true,
    })

    const agentId = await createAgent('monitor')
    const result = await runSingleShot({
      payload,
      agentId,
      input: 'account?',
      model: new FixedModel('Your account is 87654321.'),
    })
    expect(result.output).toBe('Your account is [ACCT].')
  })
})
