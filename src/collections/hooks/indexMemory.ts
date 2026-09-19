import type { CollectionAfterChangeHook } from 'payload'

/**
 * After an agent-memory record changes, enqueue a background index job that
 * embeds the content and writes the `embedding`/`search_tsv` columns (which are
 * outside Payload's field system). Mirrors the Knowledge reindex pattern but
 * for a single short record (no chunking).
 */
export const enqueueIndexMemory: CollectionAfterChangeHook = async ({ doc, req }) => {
  if ((req.context as { skipIndex?: boolean } | undefined)?.skipIndex) return doc

  await req.payload.jobs.queue({
    task: 'indexMemory',
    input: { memoryId: doc.id },
    overrideAccess: true,
  })

  return doc
}
