import { addDataAndFileToRequest, type PayloadHandler, type PayloadRequest } from 'payload'
import type { Agent } from '@/payload-types'

import { checkAgentRunAccess } from './access'
import { GuardrailError } from './guardrails'
import { runSingleShot } from './run'
import { streamAgentRun } from './stream'

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

type ResolvedRequest = {
  agent: Agent
  id: number
  input: string
  sessionId?: string
  async: boolean
}

/** Shared validation + access check for the run/stream endpoints. */
async function resolveAgentRequest(
  req: PayloadRequest,
): Promise<{ error: Response } | { data: ResolvedRequest }> {
  const { payload } = req

  const id = Number(req.routeParams?.id)
  if (!Number.isInteger(id) || id <= 0) {
    return { error: json({ error: 'Invalid agent id.' }, 400) }
  }

  let body: { input?: unknown; sessionId?: unknown; async?: unknown } = {}
  if (req.data && typeof req.data === 'object') {
    body = req.data as typeof body
  } else {
    try {
      await addDataAndFileToRequest(req)
      body = (req.data ?? {}) as typeof body
    } catch {
      return { error: json({ error: 'Invalid JSON body.' }, 400) }
    }
  }

  const input = typeof body.input === 'string' ? body.input.trim() : ''
  if (!input) {
    return { error: json({ error: 'A non-empty "input" is required.' }, 400) }
  }
  if (input.length > 8000) {
    return { error: json({ error: 'Input is too long (max 8000 characters).' }, 400) }
  }

  let agent: Agent
  try {
    agent = (await payload.findByID({
      collection: 'agents',
      id,
      depth: 0,
      overrideAccess: true,
    })) as Agent
  } catch {
    return { error: json({ error: 'Agent not found.' }, 404) }
  }

  if (agent.status !== 'active') {
    return { error: json({ error: 'Agent is not active.' }, 409) }
  }

  const access = checkAgentRunAccess(agent, req)
  if (!access.ok) {
    return { error: json({ error: access.message }, access.status) }
  }

  return {
    data: {
      agent,
      id,
      input,
      sessionId: typeof body.sessionId === 'string' ? body.sessionId : undefined,
      async: body.async === true,
    },
  }
}

/**
 * POST /api/agents/:id/run
 *
 * Body: { input: string, sessionId?: string, async?: boolean }
 *
 * Access is governed by the Agent's `runAccess` field (public /
 * authenticated / admin). Synchronous runs return the output; `async: true`
 * queues a `runAgent` job and returns the AgentRun id immediately.
 */
export const runAgentEndpoint: PayloadHandler = async (req) => {
  const resolved = await resolveAgentRequest(req)
  if ('error' in resolved) return resolved.error

  const { payload } = req
  const { id, input, sessionId, async: isAsync } = resolved.data

  if (isAsync) {
    const run = await payload.create({
      collection: 'agent-runs',
      data: { agent: id, status: 'queued', input, triggeredBy: 'queue' },
      overrideAccess: true,
    })
    await payload.jobs.queue({
      task: 'runAgent',
      input: { agentId: id, input, sessionId, runId: run.id },
      overrideAccess: true,
    })
    return json({ runId: run.id, status: 'queued' }, 202)
  }

  try {
    const result = await runSingleShot({ payload, agentId: id, input, sessionId, triggeredBy: 'api' })
    return json(result, 200)
  } catch (err) {
    if (err instanceof GuardrailError) return json({ error: err.message }, 403)
    throw err
  }
}

/**
 * POST /api/agents/:id/stream
 *
 * Same body/access as `/run`, but streams the response as SSE
 * (`text/event-stream`): `token` events as the model produces text, then a
 * final `done` (or `error`) event. The framework owns the streaming method;
 * the channel is the application's choice.
 */
export const streamAgentEndpoint: PayloadHandler = async (req) => {
  const resolved = await resolveAgentRequest(req)
  if ('error' in resolved) return resolved.error

  const { payload } = req
  const { id, input, sessionId } = resolved.data

  const stream = await streamAgentRun({ payload, agentId: id, input, sessionId, triggeredBy: 'api' })

  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  })
}
