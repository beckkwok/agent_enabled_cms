import type { TaskHandler } from 'payload'

import { runSingleShot } from '@/agents/run'

export type RunAgentJobInput = {
  agentId: number
  input: string
  sessionId?: string
  runId?: number
}

export type RunAgentJobOutput = {
  runId: number
  sessionId: string
  output: string
}

/**
 * Payload queue task that runs an agent in the background. Enqueued by the
 * run endpoint when `async: true`; updates the pre-created AgentRun row.
 */
export const runAgentTask: TaskHandler<{ input: RunAgentJobInput; output: RunAgentJobOutput }> =
  async ({ input, req }) => {
    const result = await runSingleShot({
      payload: req.payload,
      agentId: input.agentId,
      input: input.input,
      sessionId: input.sessionId,
      triggeredBy: 'queue',
      runId: input.runId,
    })

    return { output: result }
  }
