import { addDataAndFileToRequest, type PayloadHandler } from 'payload'
import type { Agent } from '@/payload-types'

import { checkAgentRunAccess } from './access'
import { runSingleShot } from './run'

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
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
  const { payload } = req

  const id = Number(req.routeParams?.id)
  if (!Number.isInteger(id) || id <= 0) {
    return json({ error: 'Invalid agent id.' }, 400)
  }

  let body: { input?: unknown; sessionId?: unknown; async?: unknown } = {}
  if (req.data && typeof req.data === 'object') {
    body = req.data as typeof body
  } else {
    try {
      await addDataAndFileToRequest(req)
      body = (req.data ?? {}) as typeof body
    } catch {
      return json({ error: 'Invalid JSON body.' }, 400)
    }
  }

  const input = typeof body.input === 'string' ? body.input.trim() : ''
  if (!input) {
    return json({ error: 'A non-empty "input" is required.' }, 400)
  }
  if (input.length > 8000) {
    return json({ error: 'Input is too long (max 8000 characters).' }, 400)
  }
  const sessionId = typeof body.sessionId === 'string' ? body.sessionId : undefined

  let agent: Agent
  try {
    agent = (await payload.findByID({
      collection: 'agents',
      id,
      depth: 0,
      overrideAccess: true,
    })) as Agent
  } catch {
    return json({ error: 'Agent not found.' }, 404)
  }

  if (agent.status !== 'active') {
    return json({ error: 'Agent is not active.' }, 409)
  }

  const access = checkAgentRunAccess(agent, req)
  if (!access.ok) {
    return json({ error: access.message }, access.status)
  }

  if (body.async === true) {
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

  const result = await runSingleShot({ payload, agentId: id, input, sessionId, triggeredBy: 'api' })
  return json(result, 200)
}
