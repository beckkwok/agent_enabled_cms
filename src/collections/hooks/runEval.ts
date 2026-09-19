import type { CollectionAfterChangeHook } from 'payload'

/**
 * When an `EvalRun` is created in `queued` state, enqueue the `runEval` job
 * that executes its cases and writes `EvalResult`s.
 */
export const enqueueRunEval: CollectionAfterChangeHook = async ({ doc, req, operation }) => {
  if (operation !== 'create') return doc
  if (doc.status !== 'queued') return doc
  if ((req.context as { skipEval?: boolean } | undefined)?.skipEval) return doc

  await req.payload.jobs.queue({
    task: 'runEval',
    input: { evalRunId: doc.id },
    overrideAccess: true,
  })

  return doc
}
