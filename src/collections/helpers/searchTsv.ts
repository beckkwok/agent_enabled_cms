import { sql } from '@payloadcms/db-postgres/drizzle'
import type { Payload } from 'payload'

/**
 * Ensures the GIN index for full-text search exists on knowledge_chunks and
 * backfills the `search_tsv` column for any existing rows. The column itself
 * is declared in Payload's schema (see helpers/pgvector.ts); this keeps its
 * values current at startup.
 */
export async function ensureSearchTsvColumn(payload: Payload) {
  await payload.db.execute({
    db: payload.db.drizzle,
    sql: sql`
      CREATE INDEX IF NOT EXISTS knowledge_chunks_search_tsv_idx
        ON knowledge_chunks USING gin (search_tsv);
      UPDATE knowledge_chunks
        SET search_tsv = to_tsvector('english', coalesce(content, ''))
        WHERE search_tsv IS NULL;
    `,
  })
}
