import { z } from 'zod'

import type { Skill } from './types'

/** Gets a single published blog post by slug. Access-controlled. */
export const getContent: Skill = {
  name: 'getContent',
  description: 'Get a published blog post by its slug.',
  parameters: {
    slug: z.string().describe('The post slug.'),
  },
  handler: async (args, ctx) => {
    const slug = String(args.slug ?? '').trim()
    if (!slug) return { post: null }
    const result = await ctx.payload.find({
      collection: 'blog-posts',
      where: { and: [{ slug: { equals: slug } }, { published: { equals: true } }] },
      limit: 1,
      depth: 0,
      overrideAccess: false,
      user: ctx.user,
    })
    return { post: result.docs[0] ?? null }
  },
}
