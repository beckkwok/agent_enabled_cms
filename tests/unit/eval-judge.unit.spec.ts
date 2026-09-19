// @vitest-environment node
import { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { AIMessage, type BaseMessage } from '@langchain/core/messages'
import type { ChatResult } from '@langchain/core/outputs'
import { describe, expect, it } from 'vitest'

import { judgeCorrectness } from '@/eval/judge'

class ReplyModel extends BaseChatModel {
  constructor(private readonly reply: string) {
    super({})
  }
  _llmType(): string {
    return 'reply'
  }
  async _generate(_messages: BaseMessage[]): Promise<ChatResult> {
    return { generations: [{ text: this.reply, message: new AIMessage(this.reply) }] }
  }
}

class ThrowingModel extends BaseChatModel {
  constructor() {
    super({})
  }
  _llmType(): string {
    return 'throwing'
  }
  async _generate(): Promise<ChatResult> {
    throw new Error('judge down')
  }
}

describe('judgeCorrectness', () => {
  it('passes with the score from the verdict', async () => {
    const v = await judgeCorrectness(new ReplyModel('{"correct": true, "score": 0.9}'), {
      input: 'capital?',
      expected: 'Paris',
      output: 'the capital of France',
    })
    expect(v.pass).toBe(true)
    expect(v.score).toBe(0.9)
    expect(v.reason).toBe('')
  })

  it('fails on an incorrect verdict', async () => {
    const v = await judgeCorrectness(new ReplyModel('{"correct": false, "score": 0.1}'), {
      input: 'capital?',
      expected: 'Paris',
      output: 'London',
    })
    expect(v.pass).toBe(false)
  })

  it('passes on a high score even without an explicit correct flag', async () => {
    const v = await judgeCorrectness(new ReplyModel('{"score": 0.85}'), {
      input: 'q',
      expected: 'a',
      output: 'b',
    })
    expect(v.pass).toBe(true)
  })

  it('parses JSON embedded in surrounding text', async () => {
    const v = await judgeCorrectness(new ReplyModel('Verdict: {"correct": true, "score": 1} — done'), {
      input: 'q',
      expected: 'a',
      output: 'a',
    })
    expect(v.pass).toBe(true)
  })

  it('fails closed on unparseable output', async () => {
    const v = await judgeCorrectness(new ReplyModel('no json here'), {
      input: 'q',
      expected: 'a',
      output: 'a',
    })
    expect(v.pass).toBe(false)
    expect(v.reason).toContain('judge')
  })

  it('fails closed when the model errors', async () => {
    const v = await judgeCorrectness(new ThrowingModel(), {
      input: 'q',
      expected: 'a',
      output: 'a',
    })
    expect(v.pass).toBe(false)
    expect(v.reason).toContain('judge down')
  })
})
