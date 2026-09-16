import type {
  CollectionAfterChangeHook,
  CollectionAfterDeleteHook,
  CollectionBeforeDeleteHook,
} from 'payload'

const CHUNK_COLLECTION = 'knowledge-chunks'

/** Deletes every KnowledgeChunk row belonging to a Knowledge doc. */
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
 * After a Knowledge doc changes, enqueue a background reindex job. The job
 * (src/jobs/reindexKnowledge.ts) does extraction, chunking, batched embedding
 * and status updates — so large documents never block the save request.
 *
 * The job updates the doc with `context.skipReindex`, so its own writes don't
 * re-enqueue (guarded below).
 */
export const enqueueReindex: CollectionAfterChangeHook = async ({ doc, req }) => {
  if ((req.context as { skipReindex?: boolean } | undefined)?.skipReindex) return doc

  await req.payload.jobs.queue({
    task: 'reindexKnowledge',
    input: { knowledgeId: doc.id },
    overrideAccess: true,
  })

  return doc
}
