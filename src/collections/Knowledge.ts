import type { CollectionConfig } from 'payload'

import { privateCollectionAccess } from './helpers/access'
import {
  deleteKnowledgeChunks,
  deleteKnowledgeChunksBefore,
  reindexKnowledge,
} from './hooks/reindexKnowledge'

export const Knowledge: CollectionConfig = {
  slug: 'knowledge',
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'content', 'updatedAt'],
    group: 'Framework',
  },
  access: privateCollectionAccess,
  hooks: {
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
  ],
}