import { getPublishedPosts } from '@/lib/site-data'
import { absoluteUrl, siteConfig } from '@/lib/site'

export const dynamic = 'force-dynamic'

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

export async function GET() {
  const { docs: posts } = await getPublishedPosts(50)

  const items = posts
    .map((post) => {
      const pubDate = post.publishedDate
        ? new Date(post.publishedDate).toUTCString()
        : new Date(post.createdAt).toUTCString()
      return `
  <item>
    <title>${escapeXml(post.title)}</title>
    <link>${escapeXml(absoluteUrl(`/blogs/${post.slug}`))}</link>
    <guid isPermaLink="false">${escapeXml(absoluteUrl(`/blogs/${post.slug}`))}</guid>
    ${post.excerpt ? `<description>${escapeXml(post.excerpt)}</description>` : ''}
    <pubDate>${pubDate}</pubDate>
  </item>`
    })
    .join('')

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(siteConfig.title)}</title>
    <link>${escapeXml(siteConfig.url)}</link>
    <description>${escapeXml(siteConfig.description)}</description>
    <language>en</language>
    <atom:link href="${escapeXml(absoluteUrl('/feed.xml'))}" rel="self" type="application/rss+xml" />
    ${items}
  </channel>
</rss>`

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    },
  })
}
