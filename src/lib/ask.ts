import { SystemMessage, AIMessage, HumanMessage } from '@langchain/core/messages'
import { getChatModel, buildSystemPrompt } from './llm'
import { HybridSearchRetriever } from './retriever'
import { getChatMessageHistory } from './memory'

export async function streamAnswer({ question, sessionId }: { question: string; sessionId: string }) {
  const retriever = new HybridSearchRetriever()
  const docs = await retriever._getRelevantDocuments(question) as import('@langchain/core/documents').Document[]

  const context = docs.map((d, i) => `[${i + 1}] ${d.pageContent}`).join('\n\n')
  const history = await getChatMessageHistory(sessionId).getMessages()
  const model = getChatModel()

  const systemContent = buildSystemPrompt() + '\n\nContext:\n' + context
  const messages = [new SystemMessage(systemContent), ...history, new HumanMessage(question)]

  const encoder = new TextEncoder()
  const stream = await model.stream(messages)

  const readable = new ReadableStream({
    async start(controller) {
      let fullContent = ''
      try {
        for await (const chunk of stream) {
          const text = (chunk as { content?: string }).content ?? ''
          if (!text) continue
          fullContent += text
          const data = JSON.stringify({ content: text }) + '\n'
          controller.enqueue(encoder.encode(data))
        }
        controller.close()
      } catch (err) {
        controller.error(err)
        return
      }
      try {
        const history = getChatMessageHistory(sessionId)
        await history.addMessage(new AIMessage({ content: fullContent }))
      } catch (memErr) {
        console.error('Memory add error:', memErr)
      }
    },
  })

  return readable
}