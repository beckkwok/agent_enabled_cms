import type { CollectionConfig } from 'payload'

import { adminOnlyAccess } from './helpers/access'

/**
 * Simple trace of an agent run: one row per invocation, written by the agent
 * runtime (and the queue task) with `overrideAccess: true`.
 *
 * This is the observability surface for the framework (roadmap step 4) —
 * status, input/output, errors and timing per run. Keep it free of secrets;
 * do not store provider keys or sensitive customer data here.
 */
export const AgentRuns: CollectionConfig = {
  slug: 'agent-runs',
  admin: {
    useAsTitle: 'id',
    group: 'Agent',
    defaultColumns: ['agent', 'status', 'triggeredBy', 'createdAt'],
  },
  access: adminOnlyAccess,
  fields: [
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
      name: 'triggeredBy',
      type: 'select',
      required: true,
      defaultValue: 'api',
      options: [
        { label: 'API', value: 'api' },
        { label: 'Queue', value: 'queue' },
        { label: 'Schedule', value: 'schedule' },
      ],
    },
    {
      name: 'input',
      type: 'textarea',
    },
    {
      name: 'output',
      type: 'textarea',
    },
    {
      name: 'error',
      type: 'textarea',
    },
    {
      name: 'session',
      type: 'relationship',
      relationTo: 'chat-sessions',
      index: true,
    },
    {
      name: 'startedAt',
      type: 'date',
    },
    {
      name: 'completedAt',
      type: 'date',
    },
  ],
}
