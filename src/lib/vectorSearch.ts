import { sql } from '@payloadcms/db-postgres/drizzle'
import type { Payload } from 'payload'

import { embedTexts } from './embeddings'

export type VectorSearchResult = {
  chunkId: number
  knowledgeId: number
  content: string
  similarity: number
}

const RRF_K = 60

/**
 * Runs keyword (Postgres FTS) search over the generated `search_tsv` column.
 * Returns up to `limit` matches ordered by ts_rank.
 */
async function keywordSearch(
  payload: Payload,
  query: string,
  limit: number,
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

/**
 * Hybrid search: merges keyword (FTS) and vector (semantic) results using
 * Reciprocal Rank Fusion (RRF). Each method contributes a score of
 * 1 / (k + rank), so documents found by both rank higher.
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
  }: {
    limit?: number
    minSimilarity?: number
    keywordLimit?: number
    vectorLimit?: number
    weights?: { keyword: number; vector: number }
  } = {},
): Promise<VectorSearchResult[]> {
  const [queryVector] = await embedTexts([query])

  const [keywordResults, vectorResults] = await Promise.all([
    keywordSearch(payload, query, keywordLimit),
    queryVector ? vectorSearchOnly(payload, queryVector, vectorLimit) : Promise.resolve([]),
  ])

  // RRF merge
  const scores = new Map<number, { content: string; knowledgeId: number; score: number }>()
  const addRank = (results: VectorSearchResult[], weight: number) => {
    results.forEach((r, i) => {
      const rank = i + 1
      const existing = scores.get(r.chunkId)
      const contribution = weight / (RRF_K + rank)
      if (existing) {
        existing.score += contribution
      } else {
        scores.set(r.chunkId, {
          content: r.content,
          knowledgeId: r.knowledgeId,
          score: contribution,
        })
      }
    })
  }

  addRank(keywordResults, weights.keyword)
  addRank(vectorResults, weights.vector)

  const merged = [...scores.entries()]
    .map(([chunkId, { content, knowledgeId, score }]) => ({
      chunkId,
      knowledgeId,
      content,
      similarity: score,
    }))
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit)
    .filter((r) => r.similarity >= minSimilarity)

  return merged
}
