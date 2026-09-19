import type { CollectionConfig } from 'payload'

import { isAdmin } from './helpers/access'
import { enqueueIndexMemory } from './hooks/indexMemory'

/**
 * Long-term agent memory: short, non-sensitive facts/preferences that persist
 * across chat sessions (and run out-of-band via the summarisation job).
 *
 * Each record is scoped to one `agent` and owned by that agent's `User`
 * principal (`owner`), so access control is per-agent: only the agent's own
 * principal (and Admins) can read a memory. Retrieval reuses this access layer
 * before the raw SQL search runs (see src/lib/memory.ts).
 *
 * The `embedding` + `search_tsv` columns are added via `afterSchemaInit`
 * (helpers/pgvector.ts) and maintained by the `indexMemory` job.
 */
export const AgentMemory: CollectionConfig = {
  slug: 'agent-memories',
  admin: {
    useAsTitle: 'content',
    defaultColumns: ['agent', 'kind', 'content', 'updatedAt'],
    group: 'Agent',
  },
  access: {
    // Non-admins may only create a memory they themselves own (owner = self),
    // i.e. the agent principal saving to its own agent. Admins pass through;
    // the beforeChange hook then resolves the agent's principal as the owner.
    create: ({ req, data }) => {
      if (isAdmin({ req })) return true
      const user = req.user as { id?: number } | null | undefined
      if (!user?.id) return false
      const owner = (data as { owner?: number | null } | undefined)?.owner
      return owner === user.id
    },
    read: ({ req }) => {
      if (isAdmin({ req })) return true
      const user = req.user as { id?: number } | null | undefined
      if (!user?.id) return false
      return { owner: { equals: user.id } }
    },
    update: ({ req }) => {
      if (isAdmin({ req })) return true
      const user = req.user as { id?: number } | null | undefined
      if (!user?.id) return false
      return { owner: { equals: user.id } }
    },
    delete: ({ req }) => {
      if (isAdmin({ req })) return true
      const user = req.user as { id?: number } | null | undefined
      if (!user?.id) return false
      return { owner: { equals: user.id } }
    },
  },
  hooks: {
    beforeChange: [
      async ({ data, operation, req }) => {
        // Default the owner to the agent's principal, so a memory stays
        // readable by the agent regardless of who authored it (e.g. an Admin
        // curating on the agent's behalf).
        if (operation === 'create' && data.agent && !data.owner) {
          const agent = await req.payload
            .findByID({ collection: 'agents', id: data.agent as number, depth: 0, overrideAccess: true })
            .catch(() => null)
          const principal = (agent as { user?: number | null } | null | undefined)?.user
          data.owner = principal ?? req.user?.id
        }
        return data
      },
    ],
    afterChange: [enqueueIndexMemory],
  },
  fields: [
    {
      name: 'agent',
      type: 'relationship',
      relationTo: 'agents',
      required: true,
      index: true,
      admin: {
        description: 'The agent this memory belongs to.',
      },
    },
    {
      name: 'owner',
      type: 'relationship',
      relationTo: 'users',
      required: true,
      index: true,
      admin: {
        readOnly: true,
        description: 'The agent principal who may read this memory (set automatically).',
      },
    },
    {
      name: 'kind',
      type: 'select',
      defaultValue: 'fact',
      options: [
        { label: 'Fact', value: 'fact' },
        { label: 'Preference', value: 'preference' },
        { label: 'Summary', value: 'summary' },
      ],
      admin: {
        description: 'Taxonomy: a single fact, a user/agent preference, or a session summary.',
      },
    },
    {
      name: 'content',
      type: 'textarea',
      required: true,
      admin: {
        description: 'Short, non-sensitive memory text. Never store PII or credentials here.',
      },
    },
    {
      name: 'session',
      type: 'relationship',
      relationTo: 'chat-sessions',
      index: true,
      admin: {
        description: 'Optional source session (for memories produced by summarisation).',
      },
    },
  ],
}
