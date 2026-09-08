import { BaseChatMessageHistory } from '@langchain/core/chat_history'
import { type BaseMessage, HumanMessage, AIMessage, SystemMessage } from '@langchain/core/messages'
import { getPayloadClient } from './site-data'

class PayloadChatMessageHistory extends BaseChatMessageHistory {
  lc_namespace = ['langchain', 'stores', 'chat_history']
  private sessionId: string

  constructor(sessionId: string) {
    super()
    this.sessionId = sessionId
  }

  async getMessages(): Promise<BaseMessage[]> {
    const payload = await getPayloadClient()
    const result = await payload.find({
      collection: 'chat-messages',
      where: { session: { equals: await this.getSessionDocId() } },
      sort: '+createdAt',
    })
    const docs = (result as { docs: { role: string; content: string; id: number }[] }).docs
    return docs.map((doc) => {
      if (doc.role === 'user') return new HumanMessage(doc.content)
      if (doc.role === 'assistant') return new AIMessage(doc.content)
      return new SystemMessage(doc.content)
    })
  }

  async addMessage(message: BaseMessage): Promise<void> {
    const payload = await getPayloadClient()
    const sessionId = await this.getSessionDocId()
    await payload.create({
      collection: 'chat-messages',
      data: {
        session: sessionId,
        role: (message._getType() === 'ai' ? 'assistant' : message._getType()) as 'user' | 'assistant' | 'system',
        content: typeof message.content === 'string'
          ? message.content
          : message.content.map((c) => (c as { text?: string }).text ?? '').join(''),
      },
    })
  }

  async addUserMessage(content: string): Promise<void> {
    await this.addMessage(new HumanMessage(content))
  }

  async addAIMessage(content: string): Promise<void> {
    await this.addMessage(new AIMessage(content))
  }

  async clear(): Promise<void> {
    const payload = await getPayloadClient()
    const sessionId = await this.getSessionDocId()
    const result = await payload.find({
      collection: 'chat-messages',
      where: { session: { equals: sessionId } },
    })
    const docs = (result as { docs: { id: number }[] }).docs
    for (const doc of docs) {
      await payload.delete({ collection: 'chat-messages', id: doc.id })
    }
  }

  private async getSessionDocId(): Promise<number> {
    const payload = await getPayloadClient()
    const result = await payload.find({
      collection: 'chat-sessions',
      where: { sessionId: { equals: this.sessionId } },
      limit: 1,
    })
    const docs = (result as { docs: { id: number }[] }).docs
    if (docs.length > 0) return docs[0].id
    const session = await payload.create({
      collection: 'chat-sessions',
      data: { sessionId: this.sessionId },
    })
    return session.id
  }
}

export function getChatMessageHistory(sessionId: string): PayloadChatMessageHistory {
  return new PayloadChatMessageHistory(sessionId)
}