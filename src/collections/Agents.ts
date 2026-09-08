import type { CollectionConfig } from 'payload'

import { adminCollectionAccess } from './helpers/access'

export const Agents: CollectionConfig = {
  slug: 'agents',
  admin: {
    useAsTitle: 'name',
    group: 'Agent',
    defaultColumns: ['name', 'kind', 'status', 'updatedAt'],
  },
  access: adminCollectionAccess,
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
