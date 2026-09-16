import {
  AIMessage,
  HumanMessage,
  SystemMessage,
  type BaseMessage,
} from '@langchain/core/messages'
import type { Payload } from 'payload'

/**
 * Default number of most-recent messages loaded as conversation memory.
 * (A window keeps the prompt bounded; long-term memory is a separate concern.)
 */
export const DEFAULT_HISTORY_LIMIT = 20

/**
 * Loads the recent conversation history for a chat session as LangChain
 * messages, oldest → newest, so it can be prepended before the new input.
 *
 * Memory is stored server-side in the framework `ChatSession`/`ChatMessage`
 * collections (Postgres). Returns [] when there is no session yet.
 */
export async function loadSessionHistory(
  payload: Payload,
  sessionId: string | undefined,
  limit: number = DEFAULT_HISTORY_LIMIT,
): Promise<BaseMessage[]> {
  if (!sessionId) return []

  const sessions = await payload.find({
    collection: 'chat-sessions',
    where: { sessionId: { equals: sessionId } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  const session = sessions.docs[0]
  if (!session) return []

  const result = await payload.find({
    collection: 'chat-messages',
    where: { session: { equals: session.id } },
    sort: '-createdAt', // most recent first, then reverse to chronological
    limit,
    depth: 0,
    overrideAccess: true,
  })

  return [...result.docs].reverse().map((doc) => {
    const content = doc.content ?? ''
    if (doc.role === 'assistant') return new AIMessage(content)
    if (doc.role === 'system') return new SystemMessage(content)
    return new HumanMessage(content)
  })
}
