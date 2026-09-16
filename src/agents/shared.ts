import { randomUUID } from 'node:crypto'
import type { Payload } from 'payload'
import type { User } from '@/payload-types'

import type { AgentWithProvider } from '@/lib/provider-runtime'

/** A loaded agent with its provider (and user principal) relationship populated. */
export type LoadedAgent = AgentWithProvider & { user?: number | User }

/** Loads an agent with provider + user populated, bypassing access (system read). */
export async function loadAgent(payload: Payload, agentId: number): Promise<LoadedAgent> {
  return (await payload.findByID({
    collection: 'agents',
    id: agentId,
    depth: 1,
    overrideAccess: true,
  })) as unknown as LoadedAgent
}

/** The agent's principal, when populated (used as the acting user for access control). */
export function actingUserOf(agent: LoadedAgent): User | null {
  return agent.user && typeof agent.user === 'object' ? agent.user : null
}

/** Flattens LangChain message content (string | content parts) into text. */
export function contentToText(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .map((part) => (typeof part === 'string' ? part : (part as { text?: string })?.text ?? ''))
      .join('')
  }
  return ''
}

/** Finds or creates the agent-scoped chat session, returning its doc id + key. */
export async function resolveSession(
  payload: Payload,
  agentId: number,
  sessionId?: string,
): Promise<{ id: number; sessionId: string }> {
  if (sessionId) {
    const found = await payload.find({
      collection: 'chat-sessions',
      where: { sessionId: { equals: sessionId } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    const existing = found.docs[0]
    if (existing) {
      if (!existing.agent) {
        await payload.update({
          collection: 'chat-sessions',
          id: existing.id,
          data: { agent: agentId },
          overrideAccess: true,
        })
      }
      return { id: existing.id, sessionId: existing.sessionId }
    }
  }

  const key = sessionId || randomUUID()
  const created = await payload.create({
    collection: 'chat-sessions',
    data: { sessionId: key, agent: agentId },
    overrideAccess: true,
  })
  return { id: created.id, sessionId: created.sessionId }
}
