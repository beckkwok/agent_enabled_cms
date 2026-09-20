import { sql, type SQL } from '@payloadcms/db-postgres/drizzle'
import type { Payload, TypedUser } from 'payload'

import { embedTexts } from './embeddings'
import { rrfFuse } from './rrf'

export type VectorSearchResult = {
  chunkId: number
  knowledgeId: number
  content: string
  similarity: number
}

/** SQL fragment restricting chunks to the allowed knowledge ids. */
function knowledgeScope(allowedIds: number[]): SQL {
  const list = sql.join(
    allowedIds.map((id) => sql`${id}`),
    sql`, `,
  )
  return sql`AND kc.knowledge_id IN (${list})`
}

/**
 * Resolves the Knowledge ids the caller may read, using the collection's
 * access rules (via Payload). Returns [] when the caller may read nothing.
 *
 * This is what makes retrieval access-aware: the access layer decides the
 * corpus, then the raw SQL search is scoped to it.
 */
async function resolveAllowedKnowledgeIds(
  payload: Payload,
  user?: null | TypedUser,
): Promise<number[]> {
  const result = await payload.find({
    collection: 'knowledge',
    where: { _status: { equals: 'published' } },
    overrideAccess: false,
    user,
    limit: 0,
    pagination: false,
    depth: 0,
  })
  return result.docs.map((doc) => doc.id as number)
}

/**
 * Runs keyword (Postgres FTS) search over the generated `search_tsv` column.
 * Returns up to `limit` matches ordered by ts_rank.
 */
async function keywordSearch(
  payload: Payload,
  query: string,
  limit: number,
  allowedIds: number[],
): Promise<VectorSearchResult[]> {
  const result = await payload.db.execute({
    db: payload.db.drizzle,
    sql: sql`
      SELECT
        kc.id AS "chunkId",
        kc.knowledge_id AS "knowledgeId",
        kc.content AS "content",
        ts_rank(kc.search_tsv, websearch_to_tsquery('english', ${query})) AS "similarity"
      FROM knowledge_chunks kc
      WHERE kc.search_tsv @@ websearch_to_tsquery('english', ${query})
      ${knowledgeScope(allowedIds)}
      ORDER BY "similarity" DESC
      LIMIT ${limit}
    `,
  })
  const rows = Array.isArray(result) ? result : result.rows
  return (rows || []).map((row: any) => ({
    chunkId: Number(row.chunkId),
    knowledgeId: Number(row.knowledgeId),
    content: String(row.content),
    similarity: Number(row.similarity),
  }))
}

/**
 * Runs vector (semantic) search over the pgvector `embedding` column.
 * Returns up to `limit` matches ordered by cosine similarity.
 */
async function vectorSearchOnly(
  payload: Payload,
  queryVector: number[],
  limit: number,
  allowedIds: number[],
): Promise<VectorSearchResult[]> {
  const vecLit = `[${queryVector.join(',')}]`
  const result = await payload.db.execute({
    db: payload.db.drizzle,
    sql: sql`
      SELECT
        kc.id AS "chunkId",
        kc.knowledge_id AS "knowledgeId",
        kc.content AS "content",
        1 - (kc.embedding <=> ${vecLit}::vector) AS "similarity"
      FROM knowledge_chunks kc
      WHERE kc.embedding IS NOT NULL
      ${knowledgeScope(allowedIds)}
      ORDER BY kc.embedding <=> ${vecLit}::vector
      LIMIT ${limit}
    `,
  })
  const rows = Array.isArray(result) ? result : result.rows
  return (rows || []).map((row: any) => ({
    chunkId: Number(row.chunkId),
    knowledgeId: Number(row.knowledgeId),
    content: String(row.content),
    similarity: Number(row.similarity),
  }))
}

export type HybridSearchOptions = {
  limit?: number
  minSimilarity?: number
  keywordLimit?: number
  vectorLimit?: number
  weights?: { keyword: number; vector: number }
  /** Caller identity. Access rules decide which Knowledge documents are searchable. */
  user?: null | TypedUser
}

/**
 * Hybrid search: merges keyword (FTS) and vector (semantic) results using
 * Reciprocal Rank Fusion (RRF). Each method contributes a score of
 * 1 / (k + rank), so documents found by both rank higher.
 *
 * Retrieval is **access-scoped**: only chunks whose parent Knowledge document
 * the caller may read are searched (resolved via Payload access rules).
 *
 * `weights` biases the blend. The returned `similarity` is the RRF score
 * (higher = more relevant), so it is not comparable to a raw cosine value.
 */
export async function hybridSearch(
  payload: Payload,
  query: string,
  {
    limit = 5,
    minSimilarity = 0.0,
    keywordLimit = 10,
    vectorLimit = 10,
    weights = { keyword: 1, vector: 1 },
    user = null,
  }: HybridSearchOptions = {},
): Promise<VectorSearchResult[]> {
  const allowedIds = await resolveAllowedKnowledgeIds(payload, user)
  if (allowedIds.length === 0) return []

  const [queryVector] = await embedTexts([query])

  const [keywordResults, vectorResults] = await Promise.all([
    keywordSearch(payload, query, keywordLimit, allowedIds),
    queryVector
      ? vectorSearchOnly(payload, queryVector, vectorLimit, allowedIds)
      : Promise.resolve([]),
  ])

  const fused = rrfFuse<number>(
    [
      {
        candidates: keywordResults.map((r) => ({ key: r.chunkId, content: r.content, meta: r.knowledgeId })),
        weight: weights.keyword,
      },
      {
        candidates: vectorResults.map((r) => ({ key: r.chunkId, content: r.content, meta: r.knowledgeId })),
        weight: weights.vector,
      },
    ],
    { limit, minSimilarity },
  )

  return fused.map((r) => ({
    chunkId: r.key,
    knowledgeId: r.meta as number,
    content: r.content,
    similarity: r.similarity,
  }))
}
