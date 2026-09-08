import type { CollectionBeforeChangeHook } from 'payload'

/**
 * Sets `publishedDate` to now the first time a doc is published.
 * Keeps published posts sorted correctly (Postgres DESC puts NULLs first).
 */
export const autoPublishDate: CollectionBeforeChangeHook = ({ data, originalDoc }) => {
  const wasPublished = originalDoc?.published === true
  const isPublishing = data.published === true && !wasPublished
  if (isPublishing && !data.publishedDate) {
    return { ...data, publishedDate: new Date().toISOString() }
  }
  return data
}
