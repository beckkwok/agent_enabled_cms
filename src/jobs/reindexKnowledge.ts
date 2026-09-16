import { sql } from '@payloadcms/db-postgres/drizzle'
import type { Payload, TaskHandler } from 'payload'
import type { Media } from '@/payload-types'

import { toVectorLiteral } from '@/collections/helpers/pgvector'
import { chunkText } from '@/lib/chunk'
import { embedTexts, EMBEDDING_MODEL } from '@/lib/embeddings'
import { extractText, readMediaFile } from '@/lib/extract'

export type ReindexKnowledgeJobInput = { knowledgeId: number }
export type ReindexKnowledgeJobOutput = { chunkCount: number; status: string }

const CHUNK_COLLECTION = 'knowledge-chunks'

async function setStatus(
  payload: Payload,
  id: number,
  data: Record<string, unknown>,
): Promise<void> {
  await payload.update({
    collection: 'knowledge',
    id,
    data,
    overrideAccess: true,
    context: { skipReindex: true },
  })
}

async function deleteChunks(payload: Payload, knowledgeId: number): Promise<void> {
  await payload.delete({
    collection: CHUNK_COLLECTION,
    where: { knowledge: { equals: knowledgeId } },
    overrideAccess: true,
  })
}

/** Resolves the source text: extracted from the uploaded file, else the content field. */
async function resolveSourceText(
  payload: Payload,
  doc: { content?: null | string; file?: number | Media | null },
): Promise<string> {
  const file = doc.file && typeof doc.file === 'object' ? doc.file : null
  if (file?.filename) {
    const buffer = await readMediaFile(file.filename)
    return extractText({ buffer, filename: file.filename, mimeType: file.mimeType })
  }
  return (doc.content ?? '').trim()
}

/**
 * Background reindex job: extract → chunk → embed (batched) → store, then
 * update the Knowledge doc's status fields. Drafts have no embeddings.
 */
export const reindexKnowledgeTask: TaskHandler<{
  input: ReindexKnowledgeJobInput
  output: ReindexKnowledgeJobOutput
}> = async ({ input, req }) => {
  const { payload } = req
  const id = input.knowledgeId

  try {
    const doc = await payload.findByID({
      collection: 'knowledge',
      id,
      depth: 1,
      overrideAccess: true,
      req,
    })

    await setStatus(payload, id, { indexStatus: 'processing', indexError: null })

    const text = await resolveSourceText(payload, doc)
    await setStatus(payload, id, { extractedText: text })

    await deleteChunks(payload, id)

    if (doc._status !== 'published' || !text.trim()) {
      await setStatus(payload, id, { indexStatus: 'idle', chunkCount: 0 })
      return { output: { chunkCount: 0, status: 'idle' } }
    }

    const chunks = chunkText(text)
    const embeddings = await embedTexts(chunks)

    for (let i = 0; i < chunks.length; i++) {
      const chunkDoc = await payload.create({
        collection: CHUNK_COLLECTION,
        data: {
          knowledge: id,
          chunkIndex: i,
          content: chunks[i],
          embeddingModel: EMBEDDING_MODEL,
        },
        overrideAccess: true,
        req,
      })

      // pgvector + tsvector columns aren't Payload fields — write via raw SQL,
      // in the same transaction as the chunk insert when one is active.
      const txnId = req.transactionID ? await req.transactionID : null
      const txnDb = txnId ? (payload.db.sessions?.[txnId]?.db as unknown) : null
      await payload.db.execute({
        db: (txnDb || payload.db.drizzle) as never,
        sql: sql`
          UPDATE knowledge_chunks
          SET
            embedding = ${toVectorLiteral(embeddings[i])},
            search_tsv = to_tsvector('english', coalesce(content, ''))
          WHERE id = ${chunkDoc.id}
        `,
      })
    }

    await setStatus(payload, id, { indexStatus: 'indexed', chunkCount: chunks.length, indexError: null })
    payload.logger.info(`Re-indexed Knowledge "${doc.title}" (${chunks.length} chunks)`)

    return { output: { chunkCount: chunks.length, status: 'indexed' } }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await setStatus(payload, id, { indexStatus: 'failed', indexError: message }).catch(() => undefined)
    throw err
  }
}
