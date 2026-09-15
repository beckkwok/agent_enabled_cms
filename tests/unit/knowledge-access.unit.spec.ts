import { describe, it, expect } from 'vitest'

import { knowledgeReadAccess } from '@/collections/helpers/access'

const call = (user: unknown) =>
  (knowledgeReadAccess as unknown as (args: { req: { user: unknown } }) => unknown)({
    req: { user },
  })

describe('knowledgeReadAccess', () => {
  it('admins see everything', () => {
    expect(call({ id: 1, collection: 'users', type: 'Admin' })).toBe(true)
  })

  it('anonymous is limited to public', () => {
    expect(call(null)).toEqual({ or: [{ visibility: { equals: 'public' } }] })
  })

  it('authenticated user can read public + authenticated + own private', () => {
    const result = call({ id: 5, collection: 'users', type: 'User', role: null }) as {
      or: unknown[]
    }
    expect(result.or).toEqual(
      expect.arrayContaining([
        { visibility: { equals: 'public' } },
        { visibility: { equals: 'authenticated' } },
        { and: [{ visibility: { equals: 'private' } }, { owner: { equals: 5 } }] },
      ]),
    )
    // No role clause when the user has no role.
    expect(JSON.stringify(result.or)).not.toContain('"allowedRoles"')
  })

  it('adds a role clause when the user has a role', () => {
    const result = call({ id: 5, collection: 'users', type: 'User', role: 7 }) as { or: unknown[] }
    expect(JSON.stringify(result.or)).toContain('"allowedRoles":{"in":[7]}')
  })

  it('accepts a populated role object', () => {
    const result = call({ id: 5, collection: 'users', type: 'User', role: { id: 9 } }) as {
      or: unknown[]
    }
    expect(JSON.stringify(result.or)).toContain('"allowedRoles":{"in":[9]}')
  })
})
