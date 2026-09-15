// @vitest-environment node
import { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { AIMessage, type BaseMessage } from '@langchain/core/messages'
import type { ChatResult } from '@langchain/core/outputs'
import { getPayload, type Payload } from 'payload'
import { beforeAll, describe, expect, it } from 'vitest'

import config from '@/payload.config'
import { runSingleShot } from '@/agents/run'
import { plainTextToLexical } from '@/lib/lexical'

/** Minimal fake chat model that returns a scripted list of messages (tool calls supported). */
class ScriptedChatModel extends BaseChatModel {
  private i = 0

  constructor(private readonly script: BaseMessage[]) {
    super({})
  }

  _llmType(): string {
    return 'scripted'
  }

  bindTools(): this {
    return this
  }

  async _generate(): Promise<ChatResult> {
    const message = this.script[Math.min(this.i, this.script.length - 1)]
    this.i += 1
    return {
      generations: [
        {
          text: typeof message.content === 'string' ? message.content : '',
          message,
        },
      ],
    }
  }
}

let payload: Payload
let agentId: number

describe('agent tools (integration)', () => {
  beforeAll(async () => {
    process.env.MOCK_LLM = '1'
    process.env.MOCK_EMBEDDINGS = '1'

    payload = await getPayload({ config: await config })
    const stamp = Date.now()

    const principal = await payload.create({
      collection: 'users',
      data: {
        email: `tool-agent-${stamp}@test.local`,
        password: 'test-password',
        name: 'Tool Agent Principal',
        type: 'Agent',
      },
      overrideAccess: true,
    })

    const agent = await payload.create({
      collection: 'agents',
      data: {
        name: `Tool Agent ${stamp}`,
        kind: 'single-shot',
        status: 'active',
        runAccess: 'authenticated',
        capabilities: [],
        tools: ['countContent'],
        user: principal.id,
        prompt: plainTextToLexical('You are a tool-using agent.'),
      },
      overrideAccess: true,
    })

    agentId = agent.id
  })

  it('calls a CMS skill during a run and returns the final answer', async () => {
    // First response requests the tool; second is the final answer.
    const model = new ScriptedChatModel([
      new AIMessage({
        content: '',
        tool_calls: [{ name: 'countContent', args: {}, id: 'call_1', type: 'tool_call' }],
      }),
      new AIMessage({ content: 'There are some posts.' }),
    ])

    const result = await runSingleShot({
      payload,
      agentId,
      input: 'How many posts are there?',
      model,
    })

    expect(result.output).toBe('There are some posts.')

    const run = await payload.findByID({
      collection: 'agent-runs',
      id: result.runId,
      depth: 0,
      overrideAccess: true,
    })
    expect(run.status).toBe('succeeded')
  })
})
