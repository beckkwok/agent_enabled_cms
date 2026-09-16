// @vitest-environment node
import { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { AIMessage, AIMessageChunk } from '@langchain/core/messages'
import { ChatGenerationChunk, type ChatResult } from '@langchain/core/outputs'
import { getPayload, type Payload } from 'payload'
import { beforeAll, describe, expect, it } from 'vitest'

import config from '@/payload.config'
import { collectStreamEvents, streamAgentRun } from '@/agents/stream'
import { plainTextToLexical } from '@/lib/lexical'

/** Scripted model that streams every scripted string as its own chunk. */
class ScriptedStreamingModel extends BaseChatModel {
  private streamed = false

  constructor(private readonly script: string[]) {
    super({})
  }

  _llmType(): string {
    return 'scripted-stream'
  }

  bindTools(): this {
    return this
  }

  async _generate(): Promise<ChatResult> {
    const text = this.script.join('')
    return { generations: [{ text, message: new AIMessage(text) }] }
  }

  async *_streamResponseChunks(): AsyncGenerator<ChatGenerationChunk> {
    const chunks = this.streamed ? [this.script[this.script.length - 1]] : this.script
    this.streamed = true
    for (const text of chunks) {
      yield new ChatGenerationChunk({ text, message: new AIMessageChunk({ content: text }) })
    }
  }
}

let payload: Payload
let agentId: number

describe('agent streaming (integration)', () => {
  beforeAll(async () => {
    process.env.MOCK_LLM = '1'
    process.env.MOCK_EMBEDDINGS = '1'
    payload = await getPayload({ config: await config })
    const stamp = Date.now()

    const principal = await payload.create({
      collection: 'users',
      data: {
        email: `stream-agent-${stamp}@test.local`,
        password: 'test-password',
        name: 'Stream Agent Principal',
        type: 'Agent',
      },
      overrideAccess: true,
    })

    const agent = await payload.create({
      collection: 'agents',
      data: {
        name: `Stream Agent ${stamp}`,
        kind: 'streaming',
        status: 'active',
        runAccess: 'authenticated',
        capabilities: [],
        tools: [],
        user: principal.id,
        prompt: plainTextToLexical('You are a streaming test agent.'),
      },
      overrideAccess: true,
    })

    agentId = agent.id
  })

  it('streams tokens, persists the session/messages and records a successful run', async () => {
    const model = new ScriptedStreamingModel(['Hello ', 'world'])
    const stream = await streamAgentRun({ payload, agentId, input: 'hi', model })
    const events = await collectStreamEvents(stream)

    const tokens = events.filter((e) => e.type === 'token').map((e) => (e as { content: string }).content).join('')
    expect(tokens).toBe('Hello world')

    const done = events.find((e) => e.type === 'done') as { runId: number; output: string } | undefined
    expect(done?.output).toBe('Hello world')

    const run = await payload.findByID({
      collection: 'agent-runs',
      id: done!.runId,
      depth: 0,
      overrideAccess: true,
    })
    expect(run.status).toBe('succeeded')
    expect(run.output).toBe('Hello world')

    const messages = await payload.find({
      collection: 'chat-messages',
      where: { session: { equals: run.session } },
      overrideAccess: true,
    })
    expect(messages.totalDocs).toBe(2)
  })
})
