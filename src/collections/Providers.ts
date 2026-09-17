import type { CollectionConfig } from 'payload'

import { adminCollectionAccess, isAdmin } from './helpers/access'
import { API_KEY_MASK, isMaskedApiKey } from '@/lib/api-key-mask'

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
        // Encrypt at rest (AES-256-CTR via PAYLOAD_SECRET). On read, only
        // reveal the plaintext for trusted server-side reads that opt in with
        // `context: { revealApiKey: true }`; otherwise return a sentinel so the
        // key never reaches the browser / API responses.
        beforeChange: [
          async ({ value, operation, originalDoc, req }) => {
            if (isMaskedApiKey(value)) {
              // Unchanged (client submitted the mask) — re-read the stored key
              // server-side (revealed) and re-encrypt it, so the plaintext never
              // round-trips through the browser.
              const id = (originalDoc as { id?: number } | undefined)?.id
              if (!id || operation !== 'update') return null
              const existing = await req.payload.findByID({
                collection: 'providers',
                id,
                depth: 0,
                overrideAccess: true,
                context: { revealApiKey: true },
              })
              const current = (existing as { apiKey?: null | string }).apiKey
              return current ? req.payload.encrypt(current) : null
            }
            if (value === null || value === undefined || value === '') return value
            return req.payload.encrypt(String(value))
          },
        ],
        afterRead: [
          ({ value, req }) => {
            if (typeof value !== 'string' || value.length === 0) return value
            const reveal = (req?.context as { revealApiKey?: boolean } | undefined)?.revealApiKey
            return reveal ? req.payload.decrypt(value) : API_KEY_MASK
          },
        ],
      },
      admin: {
        description:
          'Optional: paste the provider API key here (stored encrypted; never returned to the browser). Use keyRef for env/secret-manager instead. Only Admins can edit this.',
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
