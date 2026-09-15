import { z } from 'zod'

import { hybridSearch } from '@/lib/vectorSearch'
import type { Skill } from './types'

/**
 * Searches the framework Knowledge base (hybrid RRF) and returns the top
 * matching excerpts.
 *
 * NOTE: retrieval currently runs in a trusted context (see
 * docs/v1-open-items.md #6 / docs/retrieval.md) — it does not yet filter by
 * the caller's Document access rules.
 */
export const searchKnowledge: Skill = {
  name: 'searchKnowledge',
  description:
    'Search the site knowledge base for relevant information. Use this to answer questions about the site or its content.',
  parameters: {
    query: z.string().describe('The search query.'),
    limit: z.number().optional().describe('Maximum number of results (default 5).'),
  },
  handler: async (args, ctx) => {
    const query = String(args.query ?? '').trim()
    if (!query) return { results: [] }
    const limit = Math.min(Math.max(Number(args.limit ?? 5) || 5, 1), 20)
    const matches = await hybridSearch(ctx.payload, query, { limit })
    return {
      results: matches.map((m) => ({ content: m.content, similarity: m.similarity })),
    }
  },
}
