import { cache } from 'react'
import { getPayload } from 'payload'

import config from '@/payload.config'

/** Shared server-side Payload instance (cached per request). */
export const getPayloadClient = cache(async () => {
  const payloadConfig = await config
  return getPayload({ config: payloadConfig })
})

/** Fetches published blog posts, newest first. */
export async function getPublishedPosts(limit = 10, page = 1) {
  const payload = await getPayloadClient()
  const { docs, totalPages, page: currentPage, totalDocs } = await payload.find({
    collection: 'blog-posts',
    where: { published: { equals: true } },
    sort: '-publishedDate',
    depth: 1,
    limit,
    page,
  })
  return { docs, totalPages, page: currentPage, totalDocs }
}

/** Fetches a single blog post by slug. Draft previews require admin cookies. */
export async function getPostBySlug(slug: string, options: { draft?: boolean } = {}) {
  const payload = await getPayloadClient()
  const { docs } = await payload.find({
    collection: 'blog-posts',
    where: { and: [{ slug: { equals: slug } }, ...(options.draft ? [] : [{ published: { equals: true } }])] },
    depth: 1,
    limit: 1,
    ...(options.draft ? { draft: true } : {}),
  })
  return docs[0] || null
}

/** Fetches published posts with a given tag. */
export async function getPostsByTag(tag: string, limit = 50) {
  const payload = await getPayloadClient()
  const { docs } = await payload.find({
    collection: 'blog-posts',
    where: {
      and: [{ published: { equals: true } }, { 'tags.tag': { contains: tag } }],
    },
    sort: '-publishedDate',
    depth: 1,
    limit,
  })
  return docs
}
