import type { CollectionConfig } from 'payload'

import { adminCollectionAccess, isAdmin } from './helpers/access'

export const Providers: CollectionConfig = {
  slug: 'providers',
  admin: {
    useAsTitle: 'name',
    group: 'Framework',
    defaultColumns: ['name', 'provider', 'enabled', 'updatedAt'],
  },
  access: adminCollectionAccess,
  fields: [
    {
      name: 'name',
      type: 'text',
      required: true,
      unique: true,
      index: true,
      admin: {
        description: 'Display name, e.g. openai-prod, deepseek.',
      },
    },
    {
      name: 'provider',
      type: 'select',
      required: true,
      options: [
        { label: 'OpenAI', value: 'openai' },
        { label: 'DeepSeek', value: 'deepseek' },
        { label: 'Anthropic', value: 'anthropic' },
        { label: 'Local', value: 'local' },
      ],
      index: true,
      admin: {
        description: 'Which SDK adapter to use for this provider.',
      },
    },
    {
      name: 'models',
      type: 'array',
      admin: {
        description: 'Models this provider exposes.',
      },
      fields: [
        {
          name: 'modelId',
          type: 'text',
          required: true,
          admin: {
            description: 'e.g. text-embedding-3-small, gpt-4o, deepseek-chat.',
          },
        },
      ],
    },
    {
      name: 'keyRef',
      type: 'text',
      admin: {
        description:
          'Environment/secret variable name holding the API key, e.g. OPENAI_API_KEY. Takes precedence over the pasted key below. Never store the key itself here.',
      },
    },
    {
      name: 'apiKey',
      type: 'text',
      // Field-level access: the decrypted key is only ever exposed to Admins.
      access: {
        read: isAdmin,
        create: isAdmin,
        update: isAdmin,
      },
      hooks: {
        // Encrypt at rest (AES-256-CTR via PAYLOAD_SECRET), decrypt on read —
        // the same mechanism Payload uses for auth API keys.
        beforeChange: [
          ({ value, req }) =>
            typeof value === 'string' && value.length > 0 ? req.payload.encrypt(value) : value,
        ],
        afterRead: [
          ({ value, req }) =>
            typeof value === 'string' && value.length > 0 ? req.payload.decrypt(value) : value,
        ],
      },
      admin: {
        description:
          'Optional: paste the provider API key here (stored encrypted). Use keyRef for env/secret-manager instead. Only Admins can read or edit this.',
        components: {
          Field: '/components/admin/ApiKeyField#ApiKeyField',
        },
      },
    },
    {
      name: 'baseUrl',
      type: 'text',
      admin: {
        description: 'Optional base URL override (local/self-hosted providers).',
      },
    },
    {
      name: 'enabled',
      type: 'checkbox',
      defaultValue: true,
      index: true,
    },
  ],
}
