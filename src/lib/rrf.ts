/**
 * Reciprocal Rank Fusion (RRF) — merges ranked result lists from multiple
 * search arms (keyword + vector) into a single ranking.
 *
 * Each arm contributes `weight / (k + rank)` per candidate (rank is 1-based
 * within the arm). A candidate found by multiple arms accumulates score, so
 * it ranks higher. Callers pass the arm results and receive fused results,
 * sorted by score, sliced to `limit`, and optionally filtered by
 * `minSimilarity`. The returned `similarity` is the fused RRF score — it is
 * not comparable to a raw cosine value.
 */

export type RrfCandidate<TMeta = undefined> = {
  key: number
  content: string
  /** Opaque metadata carried through the fusion (e.g. a parent-document id). */
  meta?: TMeta
}

export type RrfArm<TMeta = undefined> = {
  candidates: RrfCandidate<TMeta>[]
  /** Arm weight (default 1) biases the blend toward that arm. */
  weight?: number
}

export type RrfResult<TMeta = undefined> = {
  key: number
  content: string
  meta?: TMeta
  similarity: number
}

export type RrfOptions = {
  limit?: number
  minSimilarity?: number
  k?: number
}

export const RRF_K = 60

export function rrfFuse<TMeta = undefined>(
  arms: RrfArm<TMeta>[],
  { limit = 5, minSimilarity = 0, k = RRF_K }: RrfOptions = {},
): RrfResult<TMeta>[] {
  const scores = new Map<number, { content: string; meta: TMeta | undefined; score: number }>()

  for (const arm of arms) {
    const weight = arm.weight ?? 1
    arm.candidates.forEach((candidate, index) => {
      const contribution = weight / (k + index + 1)
      const existing = scores.get(candidate.key)
      if (existing) {
        existing.score += contribution
      } else {
        scores.set(candidate.key, { content: candidate.content, meta: candidate.meta, score: contribution })
      }
    })
  }

  return [...scores.entries()]
    .map(([key, { content, meta, score }]) => ({ key, content, meta, similarity: score }))
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit)
    .filter((result) => result.similarity >= minSimilarity)
}
