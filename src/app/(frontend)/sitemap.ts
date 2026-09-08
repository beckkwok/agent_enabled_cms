import type { MetadataRoute } from 'next'

import { getPublishedPosts } from '@/lib/site-data'
import { absoluteUrl } from '@/lib/site'

export const dynamic = 'force-dynamic'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const { docs: posts } = await getPublishedPosts(500)

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: absoluteUrl('/'), lastModified: new Date(), changeFrequency: 'monthly', priority: 1 },
    { url: absoluteUrl('/blogs'), changeFrequency: 'weekly', priority: 0.9 },
  ]

  const postRoutes: MetadataRoute.Sitemap = posts.map((post) => ({
    url: absoluteUrl(`/blogs/${post.slug}`),
    lastModified: post.updatedAt ? new Date(post.updatedAt) : undefined,
    changeFrequency: 'monthly',
    priority: 0.7,
  }))

  return [...staticRoutes, ...postRoutes]
}
