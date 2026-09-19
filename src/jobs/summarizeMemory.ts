import type { TaskHandler } from 'payload'

import { loadSessionHistory } from '@/agents/memory'
import { resolveAgentModel } from '@/agents/model'
import { summarizeMessages } from '@/agents/summarize'
import { actingUserOf, loadAgent } from '@/agents/shared'
import { MEMORY_SUMMARIZE_THRESHOLD } from '@/lib/agent-memory'

export type SummarizeMemoryJobInput = { agentId: number; sessionId: string }
export type SummarizeMemoryJobOutput = { memoryId?: number; status: string }

/**
 * Compacts the most-recent window of a chat session into a single long-term
 * memory record (`kind: summary`) owned by the agent's principal. Enqueued by
 * `maybeSummarizeSession` once a session crosses the summarise threshold.
 */
export const summarizeMemoryTask: TaskHandler<{
  input: SummarizeMemoryJobInput
  output: SummarizeMemoryJobOutput
}> = async ({ input, req }) => {
  const { payload } = req

  try {
    const agent = await loadAgent(payload, input.agentId)
    const principal = actingUserOf(agent)
    const ownerId = principal?.id ?? (typeof agent.user === 'number' ? agent.user : undefined)
    if (!ownerId) return { output: { status: 'no-principal' } }

    const messages = await loadSessionHistory(payload, input.sessionId, MEMORY_SUMMARIZE_THRESHOLD)
    if (messages.length === 0) return { output: { status: 'empty' } }

    const summary = await summarizeMessages(resolveAgentModel(agent), messages)
    if (!summary) return { output: { status: 'empty' } }

    const sessions = await payload.find({
      collection: 'chat-sessions',
      where: { sessionId: { equals: input.sessionId } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    const session = sessions.docs[0]

    const memory = await payload.create({
      collection: 'agent-memories',
      data: {
        agent: input.agentId,
        owner: ownerId,
        kind: 'summary',
        content: summary,
        session: session?.id,
      },
      overrideAccess: true,
    })

    return { output: { memoryId: memory.id, status: 'summarized' } }
  } catch (err) {
    payload.logger.error(
      `[AACMS] summarizeMemory failed: ${err instanceof Error ? err.message : String(err)}`,
    )
    throw err
  }
}
