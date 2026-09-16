import type { CollectionConfig } from 'payload'

import { adminCollectionAccess } from './helpers/access'
import { runAgentEndpoint, streamAgentEndpoint } from '@/agents/endpoint'
import { SKILLS } from '@/agents/skills'

export const Agents: CollectionConfig = {
  slug: 'agents',
  admin: {
    useAsTitle: 'name',
    group: 'Agent',
    defaultColumns: ['name', 'kind', 'status', 'runAccess', 'updatedAt'],
  },
  access: adminCollectionAccess,
  endpoints: [
    {
      path: '/:id/run',
      method: 'post',
      handler: runAgentEndpoint,
    },
    {
      path: '/:id/stream',
      method: 'post',
      handler: streamAgentEndpoint,
    },
  ],
  fields: [
    {
      name: 'name',
      type: 'text',
      required: true,
      index: true,
      admin: {
        description: 'Agent display name.',
      },
    },
    {
      name: 'kind',
      type: 'select',
      required: true,
      options: [
        { label: 'Single-shot', value: 'single-shot' },
        { label: 'Streaming', value: 'streaming' },
      ],
      defaultValue: 'single-shot',
      index: true,
      admin: {
        description: 'Single-shot runs one operation and returns a result; streaming is conversational (chatbot).',
      },
    },
    {
      name: 'status',
      type: 'select',
      required: true,
      options: [
        { label: 'Active', value: 'active' },
        { label: 'Inactive', value: 'inactive' },
      ],
      defaultValue: 'active',
      index: true,
      admin: {
        description: 'Active agents may be triggered; inactive agents are disabled.',
      },
    },
    {
      name: 'capabilities',
      type: 'select',
      hasMany: true,
      defaultValue: [],
      options: [
        { label: 'Knowledge base (RAG)', value: 'knowledge' },
      ],
      admin: {
        description:
          'What the agent can do. "knowledge" retrieves context from the framework Knowledge base before answering.',
      },
    },
    {
      name: 'tools',
      type: 'select',
      hasMany: true,
      defaultValue: [],
      options: Object.values(SKILLS).map((skill) => ({
        label: skill.name,
        value: skill.name,
      })),
      admin: {
        description:
          'CMS skills the agent may call during a run. Calls run as the agent principal, so access rules apply.',
      },
    },
    {
      name: 'runAccess',
      type: 'select',
      required: true,
      defaultValue: 'authenticated',
      options: [
        { label: 'Public (no auth)', value: 'public' },
        { label: 'Authenticated', value: 'authenticated' },
        { label: 'Admin only', value: 'admin' },
      ],
      index: true,
      admin: {
        description:
          'Who may call POST /api/agents/:id/run. Use "public" for customer-facing FAQ agents; "admin" for agents that touch sensitive data.',
      },
    },
    {
      name: 'safetyMode',
      type: 'select',
      defaultValue: 'monitor',
      index: true,
      options: [
        { label: 'Off', value: 'off' },
        { label: 'Monitor (log flags)', value: 'monitor' },
        { label: 'Enforce (block + redact)', value: 'enforce' },
      ],
      admin: {
        description:
          'Guardrails: scan input for prompt-injection and redact secrets/PII from output. "enforce" also blocks flagged input. See docs/agents.md.',
      },
    },
    {
      name: 'user',
      type: 'relationship',
      relationTo: 'users',
      required: true,
      index: true,
      admin: {
        description:
          'The User principal (type Agent) this agent acts as for access control / MCP keys. ' +
          'The MCP access key is issued against this principal in the admin MCP → API Keys collection — ' +
          'never store the key itself on this record.',
      },
    },
    {
      name: 'provider',
      type: 'relationship',
      relationTo: 'providers',
      admin: {
        description: 'Model provider used by this agent.',
      },
    },
    {
      name: 'model',
      type: 'text',
      admin: {
        description: 'Model id to use from the chosen Provider.',
      },
    },
    {
      name: 'prompt',
      type: 'richText',
      admin: {
        description: 'System prompt / instructions for this agent.',
      },
    },
  ],
}
