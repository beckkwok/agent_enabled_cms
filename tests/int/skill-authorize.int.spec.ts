// @vitest-environment node
import { getPayload, type Payload } from 'payload'
import { beforeAll, describe, expect, it } from 'vitest'

import config from '@/payload.config'
import { SKILLS } from '@/agents/skills'
import { runSkill } from '@/agents/skills/authorize'

let payload: Payload
const stamp = Date.now()

// Register a temporary role-gated skill for this test.
SKILLS.intRoleSkill = {
  name: 'intRoleSkill',
  description: 'test skill',
  parameters: {},
  requiredRoles: ['finance'],
  handler: async () => ({ ran: true }),
}

async function makeUser(roleId: number | null) {
  return payload.create({
    collection: 'users',
    data: {
      email: `skill-auth-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@test.local`,
      password: 'test-password',
      name: 'Skill Auth User',
      type: 'User',
      role: roleId,
    },
    overrideAccess: true,
  })
}

describe('skill authorization (integration)', () => {
  beforeAll(async () => {
    payload = await getPayload({ config: await config })
  })

  it('allows a user whose role name matches (role id resolved via Payload)', async () => {
    const role = await payload.create({
      collection: 'roles',
      data: { name: `finance-${stamp}` },
      overrideAccess: true,
    })
    SKILLS.intRoleSkill.requiredRoles = [`finance-${stamp}`]

    const user = await makeUser(role.id)
    const result = await runSkill(SKILLS.intRoleSkill, {}, { payload, user })
    expect(result).toEqual({ ran: true })
  })

  it('denies a user without the role', async () => {
    const user = await makeUser(null)
    const result = (await runSkill(SKILLS.intRoleSkill, {}, { payload, user })) as {
      error: string
    }
    expect(result.error).toContain('requires role')
  })

  it('allows an Admin regardless of role', async () => {
    const admin = await payload.create({
      collection: 'users',
      data: {
        email: `skill-admin-${stamp}@test.local`,
        password: 'test-password',
        name: 'Skill Admin',
        type: 'Admin',
      },
      overrideAccess: true,
    })
    const result = await runSkill(SKILLS.intRoleSkill, {}, { payload, user: admin })
    expect(result).toEqual({ ran: true })
  })
})
