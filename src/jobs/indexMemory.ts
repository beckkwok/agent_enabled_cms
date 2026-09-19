import { sql } from '@payloadcms/db-postgres/drizzle'
import type { TaskHandler } from 'payload'

import { toVectorLiteral } from '@/collections/helpers/pgvector'
import { embedTexts } from '@/lib/embeddings'

export type IndexMemoryJobInput = { memoryId: number }
export type IndexMemoryJobOutput = { status: string }

/**
 * Embeds a single agent-memory record and writes the `embedding` + `search_tsv`
 * columns via raw SQL (they are not Payload fields). Short content, so no
 * chunking — one record, one vector.
 */
export const indexMemoryTask: TaskHandler<{
  input: IndexMemoryJobInput
  output: IndexMemoryJobOutput
}> = async ({ input, req }) => {
  const { payload } = req
  const id = input.memoryId

  try {
    const doc = await payload.findByID({
      collection: 'agent-memories',
      id,
      depth: 0,
      overrideAccess: true,
      req,
    })

    const content = String(doc.content ?? '').trim()
    if (!content) return { output: { status: 'empty' } }

    const [embedding] = await embedTexts([content])
    if (!embedding) return { output: { status: 'empty' } }

    const txnId = req.transactionID ? await req.transactionID : null
    const txnDb = txnId ? (payload.db.sessions?.[txnId]?.db as unknown) : null
    await payload.db.execute({
      db: (txnDb || payload.db.drizzle) as never,
      sql: sql`
        UPDATE agent_memories
        SET
          embedding = ${toVectorLiteral(embedding)},
          search_tsv = to_tsvector('english', coalesce(content, ''))
        WHERE id = ${id}
      `,
    })

    return { output: { status: 'indexed' } }
  } catch (err) {
    payload.logger.error(`[AACMS] indexMemory failed for #${id}: ${err instanceof Error ? err.message : String(err)}`)
    throw err
  }
}
