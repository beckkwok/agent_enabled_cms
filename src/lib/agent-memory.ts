import { sql, type SQL } from '@payloadcms/db-postgres/drizzle'
import type { Payload, TypedUser } from 'payload'

import { embedTexts } from './embeddings'

export const MEMORY_COLLECTION = 'agent-memories'
/** Messages accumulated in a session before it is summarised into long-term memory. */
export const MEMORY_SUMMARIZE_THRESHOLD = 10

export type MemorySearchResult = {
  id: number
  content: string
  similarity: number
}

const RRF_K = 60

function memoryScope(allowedIds: number[]): SQL {
  const list = sql.join(
    allowedIds.map((id) => sql`${id}`),
    sql`, `,
  )
  return sql`AND am.id IN (${list})`
}

/**
 * Resolves the agent-memory ids the caller may read, scoped to one agent.
 * Access rules (admin OR owner) decide the corpus before the SQL search runs —
 * the same trust-boundary pattern as Knowledge retrieval.
 */
async function resolveAllowedMemoryIds(
  payload: Payload,
  agentId: number,
  user?: null | TypedUser,
): Promise<number[]> {
  const result = await payload.find({
    collection: MEMORY_COLLECTION,
    where: { agent: { equals: agentId } },
    overrideAccess: false,
    user,
    limit: 0,
    pagination: false,
    depth: 0,
  })
  return result.docs.map((doc) => doc.id as number)
}

async function keywordSearch(
  payload: Payload,
  query: string,
  limit: number,
  allowedIds: number[],
): Promise<MemorySearchResult[]> {
  const result = await payload.db.execute({
    db: payload.db.drizzle,
    sql: sql`
      SELECT
        am.id AS "id",
        am.content AS "content",
        ts_rank(am.search_tsv, websearch_to_tsquery('english', ${query})) AS "similarity"
      FROM agent_memories am
      WHERE am.search_tsv @@ websearch_to_tsquery('english', ${query})
      ${memoryScope(allowedIds)}
      ORDER BY "similarity" DESC
      LIMIT ${limit}
    `,
  })
  const rows = Array.isArray(result) ? result : result.rows
  return (rows || []).map((row: any) => ({
    id: Number(row.id),
    content: String(row.content),
    similarity: Number(row.similarity),
  }))
}

async function vectorSearchOnly(
  payload: Payload,
  queryVector: number[],
  limit: number,
  allowedIds: number[],
): Promise<MemorySearchResult[]> {
  const vecLit = `[${queryVector.join(',')}]`
  const result = await payload.db.execute({
    db: payload.db.drizzle,
    sql: sql`
      SELECT
        am.id AS "id",
        am.content AS "content",
        1 - (am.embedding <=> ${vecLit}::vector) AS "similarity"
      FROM agent_memories am
      WHERE am.embedding IS NOT NULL
      ${memoryScope(allowedIds)}
      ORDER BY am.embedding <=> ${vecLit}::vector
      LIMIT ${limit}
    `,
  })
  const rows = Array.isArray(result) ? result : result.rows
  return (rows || []).map((row: any) => ({
    id: Number(row.id),
    content: String(row.content),
    similarity: Number(row.similarity),
  }))
}

export type SearchMemoryOptions = {
  limit?: number
  user?: null | TypedUser
}

/**
 * Hybrid (RRF) retrieval over one agent's long-term memory, access-scoped to
 * the memories the caller (the agent principal) may read. Injected into the
 * run prompt when the agent has the `memory` capability.
 */
export async function searchMemory(
  payload: Payload,
  agentId: number,
  query: string,
  { limit = 3, user = null }: SearchMemoryOptions = {},
): Promise<MemorySearchResult[]> {
  const allowedIds = await resolveAllowedMemoryIds(payload, agentId, user)
  if (allowedIds.length === 0) return []

  const [queryVector] = await embedTexts([query])

  const [keywordResults, vectorResults] = await Promise.all([
    keywordSearch(payload, query, limit * 2, allowedIds),
    queryVector
      ? vectorSearchOnly(payload, queryVector, limit * 2, allowedIds)
      : Promise.resolve([]),
  ])

  const scores = new Map<number, { content: string; score: number }>()
  const addRank = (results: MemorySearchResult[]) => {
    results.forEach((r, i) => {
      const contribution = 1 / (RRF_K + i + 1)
      const existing = scores.get(r.id)
      if (existing) existing.score += contribution
      else scores.set(r.id, { content: r.content, score: contribution })
    })
  }

  addRank(keywordResults)
  addRank(vectorResults)

  return [...scores.entries()]
    .map(([id, { content, score }]) => ({ id, content, similarity: score }))
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit)
}

/**
 * After a run, opportunistically summarise a session into long-term memory
 * once it has accumulated `MEMORY_SUMMARIZE_THRESHOLD` new messages. Marks the
 * window as scheduled (optimistic) to avoid re-enqueuing; the `summarizeMemory`
 * job does the actual work.
 */
export async function maybeSummarizeSession(
  payload: Payload,
  agentId: number,
  sessionId: string,
): Promise<void> {
  const sessions = await payload.find({
    collection: 'chat-sessions',
    where: { sessionId: { equals: sessionId } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  const session = sessions.docs[0]
  if (!session) return

  const count = await payload.count({
    collection: 'chat-messages',
    where: { session: { equals: session.id } },
    overrideAccess: true,
  })
  const total = count.totalDocs ?? 0
  const summarized = session.summarizedCount ?? 0
  if (total - summarized < MEMORY_SUMMARIZE_THRESHOLD) return

  await payload.update({
    collection: 'chat-sessions',
    id: session.id,
    data: { summarizedCount: total },
    overrideAccess: true,
  })
  await payload.jobs.queue({
    task: 'summarizeMemory',
    input: { agentId, sessionId },
    overrideAccess: true,
  })
}
