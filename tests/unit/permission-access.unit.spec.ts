// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { requirePermission } from '@/collections/helpers/access'

function mockPayload(permissions: string[] | null) {
  return {
    findByID: async () => (permissions ? { permissions } : null),
  } as never
}

const call = (guard: unknown, user: unknown, payload: unknown) =>
  (
    guard as unknown as (args: { req: { user: unknown; payload: unknown } }) => Promise<boolean>
  )({ req: { user, payload } })

describe('requirePermission', () => {
  it('admins always pass', async () => {
    const guard = requirePermission('content.write')
    expect(await call(guard, { id: 1, collection: 'users', type: 'Admin' }, mockPayload([]))).toBe(true)
  })

  it('grants when the role has the permission', async () => {
    const guard = requirePermission('content.write')
    const user = { id: 2, collection: 'users', type: 'User', role: 7 }
    expect(await call(guard, user, mockPayload(['content.write']))).toBe(true)
  })

  it('denies when the role lacks the permission', async () => {
    const guard = requirePermission('runs.read')
    const user = { id: 2, collection: 'users', type: 'User', role: 7 }
    expect(await call(guard, user, mockPayload(['content.write']))).toBe(false)
  })

  it('denies a principal with no role', async () => {
    const guard = requirePermission('content.write')
    const user = { id: 2, collection: 'users', type: 'User', role: null }
    expect(await call(guard, user, mockPayload(['content.write']))).toBe(false)
  })

  it('denies when the role cannot be resolved', async () => {
    const guard = requirePermission('content.write')
    const user = { id: 2, collection: 'users', type: 'User', role: 999 }
    expect(await call(guard, user, mockPayload(null))).toBe(false)
  })
})
