import type { CollectionConfig } from 'payload'

import { adminCollectionAccess } from './helpers/access'

/**
 * Application-configurable guardrail rules.
 *
 * Built-in heuristics (prompt-injection, common secret prefixes) live in code;
 * this collection lets an application add its own input/output regex rules —
 * e.g. a bank detecting account-number patterns in input or masking them in
 * output. Rules are merged with the built-ins at run time.
 *
 * `safetyMode` on the Agent is the master switch (off / monitor / enforce).
 */
export const Guardrails: CollectionConfig = {
  slug: 'guardrails',
  admin: {
    useAsTitle: 'name',
    group: 'Agent',
    defaultColumns: ['name', 'direction', 'action', 'enabled', 'updatedAt'],
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
      name: 'enabled',
      type: 'checkbox',
      defaultValue: true,
      index: true,
    },
    {
      name: 'direction',
      type: 'select',
      defaultValue: 'both',
      options: [
        { label: 'Input', value: 'input' },
        { label: 'Output', value: 'output' },
        { label: 'Both', value: 'both' },
      ],
      admin: { description: 'Whether the rule applies to user input, model output, or both.' },
    },
    {
      name: 'action',
      type: 'select',
      defaultValue: 'flag',
      options: [
        { label: 'Flag (record only)', value: 'flag' },
        { label: 'Block (reject in enforce mode)', value: 'block' },
        { label: 'Redact (replace matches)', value: 'redact' },
      ],
      admin: { description: 'What to do when the pattern matches.' },
    },
    {
      name: 'pattern',
      type: 'text',
      required: true,
      admin: {
        description:
          'Regular expression source (no slashes), e.g. \\b\\d{4}[- ]?\\d{4}[- ]?\\d{4}[- ]?\\d{4}\\b for a card number.',
      },
    },
    {
      name: 'flags',
      type: 'text',
      defaultValue: 'i',
      admin: { description: 'Regex flags, e.g. "i" (case-insensitive) or "gi" (global).' },
    },
    {
      name: 'replacement',
      type: 'text',
      defaultValue: '[REDACTED]',
      admin: { description: 'Replacement text when action is "redact".' },
    },
    {
      name: 'agent',
      type: 'relationship',
      relationTo: 'agents',
      admin: {
        description: 'Optional: scope this rule to one agent. Leave empty to apply to all agents.',
      },
    },
    {
      name: 'description',
      type: 'textarea',
    },
  ],
}
