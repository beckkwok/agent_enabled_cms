// @vitest-environment node
import { getPayload, type Payload } from 'payload'
import { beforeAll, describe, expect, it } from 'vitest'

import config from '@/payload.config'
import { type Permission } from '@/collections/helpers/access'
import { plainTextToLexical } from '@/lib/lexical'

let payload: Payload
const stamp = Date.now()

async function makeRole(permissions: Permission[] = []) {
  return payload.create({
    collection: 'roles',
    data: {
      name: `role-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      permissions,
    },
    overrideAccess: true,
  })
}

async function makeUser(roleId: number | null, type: 'User' | 'Admin' = 'User') {
  return payload.create({
    collection: 'users',
    data: {
      email: `role-acc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@test.local`,
      password: 'test-password',
      name: 'Role Acc',
      type,
      role: roleId ?? undefined,
    },
    overrideAccess: true,
  })
}

describe('role-based data access (integration)', () => {
  beforeAll(async () => {
    payload = await getPayload({ config: await config })
  })

  it('a role with content.write can create a blog post', async () => {
    const role = await makeRole(['content.write'])
    const user = await makeUser(role.id)

    const post = await payload.create({
      collection: 'blog-posts',
      data: { title: `t-${stamp}`, slug: `slug-${stamp}-a`, content: plainTextToLexical('x') },
      overrideAccess: false,
      user,
    })
    expect(post.id).toBeTruthy()
  })

  it('a role without content.write cannot create a blog post', async () => {
    const role = await makeRole([])
    const user = await makeUser(role.id)

    await expect(
      payload.create({
        collection: 'blog-posts',
        data: { title: `t-${stamp}`, slug: `slug-${stamp}-b`, content: plainTextToLexical('x') },
        overrideAccess: false,
        user,
      }),
    ).rejects.toThrow()
  })

  it('an admin bypasses role permissions', async () => {
    const admin = await makeUser(null, 'Admin')
    const post = await payload.create({
      collection: 'blog-posts',
      data: { title: `t-${stamp}`, slug: `slug-${stamp}-c`, content: plainTextToLexical('x') },
      overrideAccess: false,
      user: admin,
    })
    expect(post.id).toBeTruthy()
  })

  it('runs.read gates AgentRuns read access', async () => {
    const principal = await payload.create({
      collection: 'users',
      data: {
        email: `run-agent-${stamp}@test.local`,
        password: 'test-password',
        name: 'Run Agent Principal',
        type: 'Agent',
      },
      overrideAccess: true,
    })
    const agent = await payload.create({
      collection: 'agents',
      data: {
        name: `Runs Agent ${stamp}`,
        kind: 'single-shot',
        status: 'active',
        runAccess: 'authenticated',
        user: principal.id,
      },
      overrideAccess: true,
    })
    const run = await payload.create({
      collection: 'agent-runs',
      data: { agent: agent.id, status: 'succeeded', triggeredBy: 'api' },
      overrideAccess: true,
    })

    const noPerm = await makeRole([])
    const uNoPerm = await makeUser(noPerm.id)
    await expect(
      payload.find({
        collection: 'agent-runs',
        where: { id: { equals: run.id } },
        overrideAccess: false,
        user: uNoPerm,
      }),
    ).rejects.toThrow()

    const withPerm = await makeRole(['runs.read'])
    const uPerm = await makeUser(withPerm.id)
    const found = await payload.find({
      collection: 'agent-runs',
      where: { id: { equals: run.id } },
      overrideAccess: false,
      user: uPerm,
    })
    expect(found.totalDocs).toBe(1)
  })
})
