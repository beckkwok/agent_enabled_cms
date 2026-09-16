// @vitest-environment node
import { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { AIMessage, type BaseMessage } from '@langchain/core/messages'
import type { ChatResult } from '@langchain/core/outputs'
import { getPayload, type Payload } from 'payload'
import { beforeAll, describe, expect, it } from 'vitest'

import config from '@/payload.config'
import { loadSessionHistory } from '@/agents/memory'
import { runSingleShot } from '@/agents/run'
import { plainTextToLexical } from '@/lib/lexical'

/** Model that records the messages it was invoked with. */
class CapturingModel extends BaseChatModel {
  received: BaseMessage[] = []

  constructor() {
    super({})
  }

  _llmType(): string {
    return 'capturing'
  }

  async _generate(messages: BaseMessage[]): Promise<ChatResult> {
    this.received = messages
    return { generations: [{ text: 'ok', message: new AIMessage('ok') }] }
  }
}

let payload: Payload
let agentId: number
let sessionKey: string

describe('agent memory (integration)', () => {
  beforeAll(async () => {
    process.env.MOCK_LLM = '1'
    process.env.MOCK_EMBEDDINGS = '1'
    payload = await getPayload({ config: await config })
    const stamp = Date.now()
    sessionKey = `mem-${stamp}`

    const principal = await payload.create({
      collection: 'users',
      data: {
        email: `mem-agent-${stamp}@test.local`,
        password: 'test-password',
        name: 'Memory Agent Principal',
        type: 'Agent',
      },
      overrideAccess: true,
    })

    const agent = await payload.create({
      collection: 'agents',
      data: {
        name: `Memory Agent ${stamp}`,
        kind: 'single-shot',
        status: 'active',
        runAccess: 'authenticated',
        capabilities: [],
        tools: [],
        user: principal.id,
        prompt: plainTextToLexical('You are a memory test agent.'),
      },
      overrideAccess: true,
    })
    agentId = agent.id

    const session = await payload.create({
      collection: 'chat-sessions',
      data: { sessionId: sessionKey, agent: agentId },
      overrideAccess: true,
    })
    await payload.create({
      collection: 'chat-messages',
      data: { session: session.id, role: 'user', content: 'my name is Ada' },
      overrideAccess: true,
    })
    await payload.create({
      collection: 'chat-messages',
      data: { session: session.id, role: 'assistant', content: 'Hi Ada' },
      overrideAccess: true,
    })
  })

  it('loads session history in chronological order', async () => {
    const history = await loadSessionHistory(payload, sessionKey)
    expect(history.map((m) => m.content)).toEqual(['my name is Ada', 'Hi Ada'])
  })

  it('prepends prior conversation into the run prompt', async () => {
    const model = new CapturingModel()
    await runSingleShot({
      payload,
      agentId,
      input: 'what is my name?',
      sessionId: sessionKey,
      model,
    })

    const contents = model.received.map((m) => m.content as string)
    expect(contents).toContain('my name is Ada')
    expect(contents).toContain('Hi Ada')
    expect(contents).toContain('what is my name?')
    // Order: system prompt, prior history, then the new input.
    expect(contents[contents.length - 1]).toBe('what is my name?')
  })
})
