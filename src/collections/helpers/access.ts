import type { Access, CollectionConfig, PayloadRequest, Where } from 'payload'

type CollectionAccess = CollectionConfig['access']

type UserLike =
  | null
  | undefined
  | {
      id: number
      collection?: string
      role?: null | number | { id: number }
      type?: string
    }

/** True for a `users` principal with type Admin. */
export function isAdminUser(user: UserLike): boolean {
  return Boolean(user && user.collection === 'users' && user.type === 'Admin')
}

/**
 * True when the authenticated user is an Admin principal (i.e. a `users`
 * row with type 'Admin'). Narrowing via the `collection` marker keeps
 * other auth collections (e.g. Payload's MCP API keys) from passing.
 */
export function isAdmin({ req }: { req: PayloadRequest }): boolean {
  return isAdminUser(req.user as UserLike)
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

// ---------------------------------------------------------------------------
// Knowledge (RAG corpus) access — visibility-aware
// ---------------------------------------------------------------------------

function roleIdOf(user: NonNullable<UserLike>): number | undefined {
  if (typeof user.role === 'number') return user.role
  if (user.role && typeof user.role === 'object') return user.role.id
  return undefined
}

/**
 * Read access for Knowledge documents, based on `visibility`:
 *   - `public`        — anyone (incl. anonymous)
 *   - `authenticated` — any logged-in principal
 *   - `role`          — principals whose role is in `allowedRoles`
 *   - `private`       — the `owner` only
 * Admins see everything.
 *
 * The same rule is what retrieval reuses: hybridSearch resolves the allowed
 * knowledge ids via a `payload.find` with `overrideAccess: false`, so the
 * access layer decides the corpus before the raw SQL search runs.
 */
export const knowledgeReadAccess: Access = ({ req }) => {
  const user = req.user as UserLike
  if (isAdminUser(user)) return true

  const or: Where[] = [{ visibility: { equals: 'public' } }]

  if (user) {
    or.push({ visibility: { equals: 'authenticated' } })

    const roleId = roleIdOf(user)
    if (roleId) {
      or.push({
        and: [{ visibility: { equals: 'role' } }, { allowedRoles: { in: [roleId] } }],
      })
    }

    or.push({ and: [{ visibility: { equals: 'private' } }, { owner: { equals: user.id } }] })
  }

  return { or }
}

/** Create: any authenticated principal (owner is set by a beforeChange hook). */
export const knowledgeCreateAccess: Access = ({ req }) => Boolean(req.user)

/** Update/delete: Admins, or the document owner. */
export const knowledgeWriteAccess: Access = ({ req }) => {
  const user = req.user as UserLike
  if (isAdminUser(user)) return true
  if (!user) return false
  return { owner: { equals: user.id } }
}