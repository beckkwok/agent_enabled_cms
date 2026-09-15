import type { CollectionConfig } from 'payload'

import {
  knowledgeCreateAccess,
  knowledgeReadAccess,
  knowledgeWriteAccess,
} from './helpers/access'
import {
  deleteKnowledgeChunks,
  deleteKnowledgeChunksBefore,
  reindexKnowledge,
} from './hooks/reindexKnowledge'

export const Knowledge: CollectionConfig = {
  slug: 'knowledge',
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'visibility', 'updatedAt'],
    group: 'Framework',
  },
  access: {
    create: knowledgeCreateAccess,
    read: knowledgeReadAccess,
    update: knowledgeWriteAccess,
    delete: knowledgeWriteAccess,
  },
  hooks: {
    beforeChange: [
      // Set the owner on create so `private` visibility works by default.
      ({ data, operation, req }) => {
        if (operation === 'create' && req.user && !data.owner) {
          data.owner = req.user.id
        }
        return data
      },
    ],
    afterChange: [reindexKnowledge],
    beforeDelete: [deleteKnowledgeChunksBefore],
    afterDelete: [deleteKnowledgeChunks],
  },
  versions: {
    drafts: true,
    maxPerDoc: 20,
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
    },
    {
      name: 'content',
      type: 'textarea',
      required: true,
      admin: {
        description:
          'Source text that will be chunked and embedded for retrieval-augmented generation (the agent knowledge base). ' +
          'Store only internal/knowledge documents here — do NOT put personal or customer data in this collection.',
      },
    },
    {
      name: 'sourceUrl',
      type: 'text',
      admin: {
        description: 'Optional link to the original source (e.g. the blog post URL).',
      },
    },
    {
      name: 'visibility',
      type: 'select',
      required: true,
      defaultValue: 'authenticated',
      index: true,
      options: [
        { label: 'Public (anyone)', value: 'public' },
        { label: 'Authenticated', value: 'authenticated' },
        { label: 'Role-restricted', value: 'role' },
        { label: 'Private (owner only)', value: 'private' },
      ],
      admin: {
        description:
          'Who may retrieve this document. Retrieval and normal reads both enforce this.',
      },
    },
    {
      name: 'owner',
      type: 'relationship',
      relationTo: 'users',
      index: true,
      admin: {
        description: 'Owner (used by `private` visibility). Set automatically on create.',
      },
    },
    {
      name: 'allowedRoles',
      type: 'relationship',
      relationTo: 'roles',
      hasMany: true,
      admin: {
        description: 'Roles allowed to retrieve this document when visibility is `role`.',
      },
    },
  ],
}
