import type { CollectionConfig, PayloadRequest } from 'payload'

type CollectionAccess = CollectionConfig['access']

/**
 * True when the authenticated user is an Admin principal (i.e. a `users`
 * row with type 'Admin'). Narrowing via the `collection` marker keeps
 * other auth collections (e.g. Payload's MCP API keys) from passing.
 */
export function isAdmin({ req }: { req: PayloadRequest }): boolean {
  const user = req.user as (typeof req.user & { collection?: string }) | null
  return Boolean(user && user.collection === 'users' && user.type === 'Admin')
}

const protectedContentAccess: CollectionAccess = {
  create: ({ req }) => !!req.user,
  read: () => true,
  update: ({ req }) => !!req.user,
  delete: ({ req }) => !!req.user,
}

// Public read for content collections; writes restricted to authenticated users
export const publicCollectionAccess: CollectionAccess = { ...protectedContentAccess }

// Private collections (e.g. Knowledge for the RAG): authenticated for every operation
export const privateCollectionAccess: CollectionAccess = {
  create: ({ req }) => !!req.user,
  read: ({ req }) => !!req.user,
  update: ({ req }) => !!req.user,
  delete: ({ req }) => !!req.user,
}

// Admin-only collections (framework/config): manage only as an Admin principal
export const adminCollectionAccess: CollectionAccess = {
  create: isAdmin,
  read: ({ req }) => !!req.user,
  update: isAdmin,
  delete: isAdmin,
}

// Strictly Admin-only for every operation (e.g. system trace collections).
// System writes still work via local API with `overrideAccess: true`.
export const adminOnlyAccess: CollectionAccess = {
  create: isAdmin,
  read: isAdmin,
  update: isAdmin,
  delete: isAdmin,
}