import type { TaskHandler } from 'payload'

import { runEvaluation } from '@/eval/runner'

export type RunEvalJobInput = { evalRunId: number }
export type RunEvalJobOutput = { status: string }

/**
 * Queue task: runs a queued `EvalRun` (its agent's `EvalCase`s) and writes
 * `EvalResult`s + the aggregate back to the collections.
 */
export const runEvalTask: TaskHandler<{
  input: RunEvalJobInput
  output: RunEvalJobOutput
}> = async ({ input, req }) => {
  try {
    await runEvaluation(req.payload, input.evalRunId)
    return { output: { status: 'succeeded' } }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await req.payload
      .update({
        collection: 'eval-runs',
        id: input.evalRunId,
        data: { status: 'failed' },
        overrideAccess: true,
      })
      .catch(() => undefined)
    req.payload.logger.error(`[AACMS] runEval failed: ${message}`)
    throw err
  }
}
