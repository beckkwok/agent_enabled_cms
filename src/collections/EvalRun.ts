import type { CollectionConfig } from 'payload'

import { adminOnlyAccess } from './helpers/access'
import { enqueueRunEval } from './hooks/runEval'

/**
 * One evaluation batch: a set of `EvalCase`s run against a single agent,
 * producing `EvalResult`s and an aggregate score. Created with `status:
 * queued`; the afterChange hook enqueues the `runEval` job.
 */
export const EvalRun: CollectionConfig = {
  slug: 'eval-runs',
  admin: {
    useAsTitle: 'name',
    group: 'Evaluation',
    defaultColumns: ['name', 'agent', 'status', 'passed', 'failed', 'createdAt'],
  },
  access: adminOnlyAccess,
  hooks: {
    afterChange: [enqueueRunEval],
  },
  fields: [
    {
      name: 'name',
      type: 'text',
      required: true,
    },
    {
      name: 'agent',
      type: 'relationship',
      relationTo: 'agents',
      required: true,
      index: true,
    },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'queued',
      index: true,
      options: [
        { label: 'Queued', value: 'queued' },
        { label: 'Running', value: 'running' },
        { label: 'Succeeded', value: 'succeeded' },
        { label: 'Failed', value: 'failed' },
      ],
    },
    {
      name: 'caseCount',
      type: 'number',
      defaultValue: 0,
    },
    {
      name: 'passed',
      type: 'number',
      defaultValue: 0,
    },
    {
      name: 'failed',
      type: 'number',
      defaultValue: 0,
    },
    {
      name: 'score',
      type: 'number',
      defaultValue: 0,
      admin: {
        description: 'Mean case score 0..1 across the cases.',
      },
    },
    {
      name: 'passThreshold',
      type: 'number',
      defaultValue: 1,
      admin: {
        description: 'Minimum aggregate score (0..1) required to pass the gate.',
      },
    },
    {
      name: 'gatePassed',
      type: 'checkbox',
      defaultValue: false,
      admin: {
        readOnly: true,
        description: 'Computed by the runner: score >= passThreshold.',
      },
    },
    {
      name: 'completedAt',
      type: 'date',
    },
  ],
}
