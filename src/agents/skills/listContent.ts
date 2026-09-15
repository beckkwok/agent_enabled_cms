import { z } from 'zod'

import type { Skill } from './types'

/** Lists published blog posts (title/slug/excerpt). Access-controlled. */
export const listContent: Skill = {
  name: 'listContent',
  description: 'List published blog posts with their title, slug and excerpt.',
  parameters: {
    limit: z.number().optional().describe('Maximum number of posts (default 10).'),
  },
  handler: async (args, ctx) => {
    const limit = Math.min(Math.max(Number(args.limit ?? 10) || 10, 1), 50)
    const result = await ctx.payload.find({
      collection: 'blog-posts',
      where: { published: { equals: true } },
      sort: '-publishedDate',
      limit,
      depth: 0,
      select: { title: true, slug: true, excerpt: true, publishedDate: true },
      overrideAccess: false,
      user: ctx.user,
    })
    return { posts: result.docs }
  },
}
