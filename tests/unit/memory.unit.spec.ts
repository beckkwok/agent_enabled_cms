// @vitest-environment node
import { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { AIMessage, HumanMessage, type BaseMessage } from '@langchain/core/messages'
import type { ChatResult } from '@langchain/core/outputs'
import { describe, expect, it } from 'vitest'

import { summarizeMessages } from '@/agents/summarize'

class FixedModel extends BaseChatModel {
  constructor() {
    super({})
  }
  _llmType(): string {
    return 'fixed'
  }
  async _generate(_messages: BaseMessage[]): Promise<ChatResult> {
    const text = '  The user prefers email.  '
    return { generations: [{ text, message: new AIMessage(text) }] }
  }
}

describe('summarizeMessages', () => {
  it('returns a trimmed summary', async () => {
    const summary = await summarizeMessages(new FixedModel(), [new HumanMessage('hi')])
    expect(summary).toBe('The user prefers email.')
  })
})
