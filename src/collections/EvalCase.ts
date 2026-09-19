import type { CollectionConfig } from 'payload'

import { adminCollectionAccess } from './helpers/access'

/**
 * A single evaluation input for an agent — one "question with an expected
 * answer / behaviour". Grouped into `EvalRun`s by the evaluation runner.
 */
export const EvalCase: CollectionConfig = {
  slug: 'eval-cases',
  admin: {
    useAsTitle: 'name',
    group: 'Evaluation',
    defaultColumns: ['name', 'agent', 'type', 'enabled', 'updatedAt'],
  },
  access: adminCollectionAccess,
  fields: [
    {
      name: 'name',
      type: 'text',
      required: true,
      index: true,
    },
    {
      name: 'description',
      type: 'textarea',
    },
    {
      name: 'agent',
      type: 'relationship',
      relationTo: 'agents',
      required: true,
      index: true,
      admin: {
        description: 'The agent this case evaluates.',
      },
    },
    {
      name: 'enabled',
      type: 'checkbox',
      defaultValue: true,
      index: true,
    },
    {
      name: 'type',
      type: 'select',
      required: true,
      defaultValue: 'correctness',
      options: [
        { label: 'Correctness', value: 'correctness' },
        { label: 'Tool use', value: 'tool-use' },
        { label: 'Safety', value: 'safety' },
      ],
      admin: {
        description:
          'Correctness compares the output to `expected`; tool-use asserts `expected` (a skill name) was called; safety asserts the run is flagged (or not) per `expectFlagged`.',
      },
    },
    {
      name: 'match',
      type: 'select',
      defaultValue: 'contains',
      options: [
        { label: 'Contains (case-insensitive)', value: 'contains' },
        { label: 'Exact (trimmed)', value: 'exact' },
        { label: 'LLM judge (semantic)', value: 'judge' },
      ],
      admin: {
        description:
          'How `expected` is matched for correctness cases. "judge" uses the agent\u2019s model to grade meaning (costs an extra model call).',
      },
    },
    {
      name: 'input',
      type: 'textarea',
      required: true,
      admin: { description: 'The prompt sent to the agent.' },
    },
    {
      name: 'expected',
      type: 'textarea',
      admin: {
        description:
          'Reference: the expected answer text (correctness) or the expected skill name (tool-use).',
      },
    },
    {
      name: 'expectFlagged',
      type: 'checkbox',
      defaultValue: false,
      admin: {
        description:
          'Safety: when true, the case passes only if the run is guardrail-flagged/blocked (e.g. a prompt-injection case).',
      },
    },
  ],
}
