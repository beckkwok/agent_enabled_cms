import type { CollectionConfig } from 'payload'

import { adminOnlyAccess } from './helpers/access'

/**
 * One scored result per `EvalCase` within an `EvalRun`. Written by the
 * evaluation runner; references the `AgentRun` trace for full detail.
 */
export const EvalResult: CollectionConfig = {
  slug: 'eval-results',
  admin: {
    useAsTitle: 'case',
    group: 'Evaluation',
    defaultColumns: ['evalRun', 'case', 'pass', 'score', 'updatedAt'],
  },
  access: adminOnlyAccess,
  fields: [
    {
      name: 'evalRun',
      type: 'relationship',
      relationTo: 'eval-runs',
      required: true,
      index: true,
    },
    {
      name: 'case',
      type: 'relationship',
      relationTo: 'eval-cases',
      required: true,
      index: true,
    },
    {
      name: 'agent',
      type: 'relationship',
      relationTo: 'agents',
      index: true,
    },
    {
      name: 'agentRun',
      type: 'relationship',
      relationTo: 'agent-runs',
      index: true,
      admin: { description: 'The AgentRun trace produced for this case.' },
    },
    {
      name: 'output',
      type: 'textarea',
    },
    {
      name: 'toolCalls',
      type: 'textarea',
      admin: { description: 'JSON array of tool calls the model made.' },
    },
    {
      name: 'flagged',
      type: 'checkbox',
      defaultValue: false,
    },
    {
      name: 'flagReasons',
      type: 'textarea',
    },
    {
      name: 'pass',
      type: 'checkbox',
      defaultValue: false,
      index: true,
    },
    {
      name: 'score',
      type: 'number',
      defaultValue: 0,
    },
    {
      name: 'reasons',
      type: 'textarea',
      admin: { description: 'Why the case passed or failed.' },
    },
  ],
}
