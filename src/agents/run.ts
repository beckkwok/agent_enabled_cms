import { randomUUID } from 'node:crypto'
import { HumanMessage, SystemMessage } from '@langchain/core/messages'
import type { Payload } from 'payload'
import type { Agent, AgentRun } from '@/payload-types'

import { hybridSearch } from '@/lib/vectorSearch'
import { agentPromptToText } from './prompt'
import { resolveAgentModel } from './model'
import type { AgentWithProvider } from '@/lib/provider-runtime'

export type RunTrigger = NonNullable<AgentRun['triggeredBy']>

export type RunSingleShotArgs = {
  payload: Payload
  agentId: number
  input: string
  sessionId?: string
  triggeredBy?: RunTrigger
  /** When set, updates an existing AgentRun (e.g. one created by the API as queued). */
  runId?: number
}

export type RunSingleShotResult = {
  runId: number
  output: string
  sessionId: string
}

function contentToText(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .map((part) => (typeof part === 'string' ? part : (part as { text?: string })?.text ?? ''))
      .join('')
  }
  return ''
}

/** Finds or creates the agent-scoped chat session, returning its doc id + key. */
async function resolveSession(
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

/**
 * Runs an agent once (single-shot) and records an AgentRun trace.
 *
 * For agents with the `knowledge` capability, the input is used to retrieve
 * context from the framework Knowledge base (hybrid RRF search) before the
 * model call.
 */
export async function runSingleShot({
  payload,
  agentId,
  input,
  sessionId,
  triggeredBy = 'api',
  runId,
}: RunSingleShotArgs): Promise<RunSingleShotResult> {
  const agent = (await payload.findByID({
    collection: 'agents',
    id: agentId,
    depth: 1,
    overrideAccess: true,
  })) as unknown as AgentWithProvider

  const startedAt = new Date().toISOString()

  const run = runId
    ? await payload.update({
        collection: 'agent-runs',
        id: runId,
        data: { status: 'running', startedAt },
        overrideAccess: true,
      })
    : await payload.create({
        collection: 'agent-runs',
        data: { agent: agentId, status: 'running', input, triggeredBy, startedAt },
        overrideAccess: true,
      })

  try {
    // Build context for knowledge-capable agents.
    const capabilities = agent.capabilities ?? []
    let context = ''
    if (capabilities.includes('knowledge')) {
      const matches = await hybridSearch(payload, input, { limit: 5 })
      context = matches.map((m, i) => `[${i + 1}] ${m.content}`).join('\n\n')
    }

    const systemParts = [agentPromptToText(agent.prompt)]
    if (context) systemParts.push(`Context:\n${context}`)
    const systemContent = systemParts.filter(Boolean).join('\n\n')

    const model = resolveAgentModel(agent)
    const messages = [
      ...(systemContent ? [new SystemMessage(systemContent)] : []),
      new HumanMessage(input),
    ]

    const response = await model.invoke(messages)
    const output = contentToText(response.content)

    const session = await resolveSession(payload, agentId, sessionId)

    await payload.create({
      collection: 'chat-messages',
      data: { session: session.id, role: 'user', content: input },
      overrideAccess: true,
    })
    await payload.create({
      collection: 'chat-messages',
      data: { session: session.id, role: 'assistant', content: output },
      overrideAccess: true,
    })

    await payload.update({
      collection: 'agent-runs',
      id: run.id,
      data: {
        status: 'succeeded',
        output,
        completedAt: new Date().toISOString(),
        session: session.id,
      },
      overrideAccess: true,
    })

    return { runId: run.id, output, sessionId: session.sessionId }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await payload
      .update({
        collection: 'agent-runs',
        id: run.id,
        data: { status: 'failed', error: message, completedAt: new Date().toISOString() },
        overrideAccess: true,
      })
      .catch(() => undefined)
    throw err
  }
}
