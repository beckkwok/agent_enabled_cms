import type { CollectionConfig } from 'payload'

import { privateCollectionAccess } from './helpers/access'

/**
 * Stores one embedded chunk of a Knowledge document. The `embedding` pgvector
 * column is added via `afterSchemaInit` (see helpers/pgvector.ts) and is not
 * managed by Payload's field system, so it is written/read via raw SQL.
 */
export const KnowledgeChunk: CollectionConfig = {
  slug: 'knowledge-chunks',
  admin: {
    useAsTitle: 'content',
    defaultColumns: ['knowledge', 'chunkIndex', 'updatedAt'],
    group: 'RAG',
    hidden: true,
  },
  access: privateCollectionAccess,
  fields: [
    {
      name: 'knowledge',
      type: 'relationship',
      relationTo: 'knowledge',
      required: true,
      index: true,
    },
    {
      name: 'chunkIndex',
      type: 'number',
      required: true,
      defaultValue: 0,
      index: true,
    },
    {
      name: 'content',
      type: 'textarea',
      required: true,
    },
    {
      name: 'embeddingModel',
      type: 'text',
      required: true,
      defaultValue: 'text-embedding-3-small',
    },
  ],
}
