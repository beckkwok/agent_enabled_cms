import { customType, index } from '@payloadcms/db-postgres/drizzle/pg-core'
import type { PostgresSchemaHook } from '@payloadcms/drizzle/postgres'

export const EMBEDDING_DIMENSIONS = 1536 // text-embedding-3-small

/**
 * Drizzle custom type for a pgvector column of fixed dimensions.
 */
export const vector = (dimensions: number) =>
  customType<{ data: number[]; driverData: string }>({
    dataType() {
      return `vector(${dimensions})`
    },
    fromDriver(value: string): number[] {
      return value
        .slice(1, -1)
        .split(',')
        .map((n) => parseFloat(n))
    },
    toDriver(value: number[]): string {
      return `[${value.join(',')}]`
    },
  })

/**
 * Drizzle custom type for a tsvector column (full-text search).
 */
export const tsvector = () =>
  customType<{ data: string; driverData: string }>({
    dataType() {
      return 'tsvector'
    },
    fromDriver(value: string): string {
      return value
    },
    toDriver(value: string): string {
      return value
    },
  })

/**
 * Converts a JS number[] into the pgvector text literal used in SQL:
 * '[0.1,0.2,...]'
 */
export function toVectorLiteral(values: number[]): string {
  return `[${values.join(',')}]`
}

/**
 * Extends the `knowledge_chunks` table with:
 *  - a pgvector `embedding` column + HNSW index (cosine), and
 *  - a `search_tsv` tsvector column + GIN index for keyword search.
 *
 * Both are added outside of Payload's field system via the documented
 * `afterSchemaInit` hook. `search_tsv` is kept in the schema so Payload's
 * dev-mode schema push doesn't try to drop it; its values are maintained by
 * the reindex hook (see hooks/reindexKnowledge.ts).
 */
export const pgVectorSchemaHook: PostgresSchemaHook = ({ extendTable, schema }) => {
  const table = schema.tables['knowledge_chunks']
  if (table) {
    extendTable({
      table,
      columns: {
        embedding: vector(EMBEDDING_DIMENSIONS)('embedding'),
        search_tsv: tsvector()('search_tsv'),
      },
      extraConfig: (t) => ({
        embeddingIndex: index('knowledge_chunks_embedding_idx')
          .using('hnsw', t.embedding.op('vector_cosine_ops'))
          .with({ m: 16, ef_construction: 64 }),
        searchTsvIndex: index('knowledge_chunks_search_tsv_idx').using('gin', t.search_tsv),
      }),
    })
  }
  return schema
}
