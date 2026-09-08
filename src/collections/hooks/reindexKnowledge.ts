import type {
  CollectionAfterChangeHook,
  CollectionBeforeDeleteHook,
  CollectionAfterDeleteHook,
} from 'payload'
import { sql } from '@payloadcms/db-postgres/drizzle'

import { chunkText } from '../../lib/chunk'
import { embedTexts, EMBEDDING_MODEL } from '../../lib/embeddings'
import { toVectorLiteral } from '../helpers/pgvector'

const CHUNK_COLLECTION = 'knowledge-chunks'

/**
 * Deletes every KnowledgeChunk row belonging to a Knowledge doc.
 */
async function deleteChunks(req: { payload: any }, knowledgeId: number) {
  await req.payload.delete({
    collection: CHUNK_COLLECTION,
    where: { knowledge: { equals: knowledgeId } },
    req,
  })
}

/**
 * Runs BEFORE the parent Knowledge doc is deleted so child chunk rows are
 * removed first. This avoids the FK (`knowledge_id` NOT NULL, ON DELETE SET
 * NULL) constraint firing during the parent delete.
 */
export const deleteKnowledgeChunksBefore: CollectionBeforeDeleteHook = async ({ id, req }) => {
  await deleteChunks(req, id as number)
  return id
}

/**
 * When a Knowledge doc is deleted, remove its chunks from the vector store.
 * Kept as a fallback safety net (e.g. bulk/where deletes that skip beforeDelete).
 */
export const deleteKnowledgeChunks: CollectionAfterDeleteHook = async ({ doc, req }) => {
  await deleteChunks(req, doc.id)
  return doc
}

/**
 * After a Knowledge doc is created, updated, or published, rebuild its
 * embeddings: chunk the content, embed each chunk, then replace all stored
 * chunks (old + new) in a single pass.
 *
 * Drafts never get embeddings, so switching to draft removes them from the RAG.
 */
export const reindexKnowledge: CollectionAfterChangeHook = async ({
  doc,
  operation,
  previousDoc,
  req,
}) => {
  const isPublish = operation === 'create' || doc._status === 'published'

  // Remove stale chunks in both directions:
  // - previously published -> now draft: drop embeddings
  // - draft -> draft: nothing stored, nothing to delete
  await deleteChunks(req, doc.id)

  if (!isPublish) {
    return doc
  }

  const content = doc.content || ''
  if (!content.trim()) {
    return doc
  }

  const chunks = chunkText(content)
  if (chunks.length === 0) {
    return doc
  }

  const embeddings = await embedTexts(chunks)

  for (let i = 0; i < chunks.length; i++) {
    const chunkDoc = await req.payload.create({
      collection: CHUNK_COLLECTION,
      data: {
        knowledge: doc.id,
        chunkIndex: i,
        content: chunks[i],
        embeddingModel: EMBEDDING_MODEL,
      },
      overrideAccess: true,
      req,
    })

    // The pgvector column isn't a Payload field, so write it with raw SQL.
    // Must run in the same transaction as the chunk insert (else it can't see
    // the uncommitted chunk row).
    const txnId = req.transactionID ? await req.transactionID : null
    const txnDb = txnId
      ? (req.payload.db.sessions?.[txnId]?.db as any)
      : null
    const vectorLiteral = toVectorLiteral(embeddings[i])
    await req.payload.db.execute({
      db: (txnDb || req.payload.db.drizzle) as any,
      sql: sql`
        UPDATE knowledge_chunks
        SET
          embedding = ${vectorLiteral},
          search_tsv = to_tsvector('english', coalesce(content, ''))
        WHERE id = ${chunkDoc.id}
      `,
    })
  }

  req.payload.logger.info(`Re-indexed Knowledge "${doc.title}" (${chunks.length} chunks)`)

  return doc
}
