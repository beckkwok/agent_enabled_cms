/** Central site metadata shared by SEO routes and pages. */
export const siteConfig = {
  name: 'AACMS',
  title: 'Agent-Enabled CMS',
  description: 'A PayloadCMS + LangChain.js framework managing content, data, and agents together.',
  url: process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000',
  author: 'AACMS',
  locale: 'en_GB',
}

export function absoluteUrl(path = ''): string {
  return `${siteConfig.url}${path}`
}

/**
 * Extracts non-empty tag strings from a Payload tags array.
 * The type guard ensures callers get `string[]` (not `(string|null)[]`).
 */
export function extractTags(tags: { tag?: string | null }[] | null | undefined): string[] {
  if (!tags) return []
  return tags
    .map((t) => t?.tag)
    .filter((tag): tag is string => Boolean(tag) && (tag as string).trim().length > 0)
}
