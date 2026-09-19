import type { Skill } from './types'

/** Reporting example: counts published blog posts. Access-controlled. */
export const countContent: Skill = {
  name: 'countContent',
  description: 'Count published blog posts (reporting example).',
  parameters: {},
  handler: async (_args, ctx) => {
    const result = await ctx.payload.find({
      collection: 'blog-posts',
      where: { published: { equals: true } },
      limit: 0,
      depth: 0,
      overrideAccess: false,
      user: ctx.user,
    })
    return { totalDocs: result.totalDocs }
  },
}
