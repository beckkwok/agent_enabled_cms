// @vitest-environment node
import { describe, it, expect, vi } from 'vitest'

import { authorizeSkill, runSkill } from '@/agents/skills/authorize'
import type { Skill, SkillContext } from '@/agents/skills/types'

function makeSkill(overrides: Partial<Skill> = {}): Skill {
  return {
    name: 'testSkill',
    description: 'test',
    parameters: {},
    handler: vi.fn(async () => ({ ok: true })),
    ...overrides,
  }
}

function ctx(user: unknown, payload: unknown = {}): SkillContext {
  return { payload: payload as never, user: user as never }
}

describe('authorizeSkill', () => {
  it('allows any principal when no requirements are set', async () => {
    expect(await authorizeSkill(makeSkill(), ctx(null))).toEqual({ ok: true })
    expect(await authorizeSkill(makeSkill(), ctx({ type: 'User' }))).toEqual({ ok: true })
  })

  it('always allows Admins', async () => {
    const skill = makeSkill({ requiredUserTypes: ['Admin'], requiredRoles: ['superuser'] })
    expect(await authorizeSkill(skill, ctx({ type: 'Admin' }))).toEqual({ ok: true })
  })

  it('enforces requiredUserTypes', async () => {
    const skill = makeSkill({ requiredUserTypes: ['Admin'] })
    const denied = await authorizeSkill(skill, ctx({ type: 'User' }))
    expect(denied.ok).toBe(false)
    expect(await authorizeSkill(skill, ctx({ type: 'Agent' }))).toMatchObject({ ok: false })
  })

  it('allows a matching user type', async () => {
    const skill = makeSkill({ requiredUserTypes: ['Agent'] })
    expect(await authorizeSkill(skill, ctx({ type: 'Agent' }))).toEqual({ ok: true })
  })

  it('enforces requiredRoles with a populated role object', async () => {
    const skill = makeSkill({ requiredRoles: ['finance'] })
    expect(await authorizeSkill(skill, ctx({ type: 'User', role: { name: 'finance' } }))).toEqual({
      ok: true,
    })
    expect(
      await authorizeSkill(skill, ctx({ type: 'User', role: { name: 'support' } })),
    ).toMatchObject({ ok: false })
  })

  it('resolves a role id via Payload when requiredRoles is set', async () => {
    const skill = makeSkill({ requiredRoles: ['finance'] })
    const payload = {
      findByID: vi.fn(async () => ({ name: 'finance' })),
    }
    expect(await authorizeSkill(skill, ctx({ type: 'User', role: 7 }, payload))).toEqual({
      ok: true,
    })
    expect(payload.findByID).toHaveBeenCalledWith(
      expect.objectContaining({ collection: 'roles', id: 7 }),
    )
  })

  it('denies an unauthenticated caller when requirements exist', async () => {
    const skill = makeSkill({ requiredUserTypes: ['Admin'] })
    expect(await authorizeSkill(skill, ctx(null))).toMatchObject({ ok: false })
  })
})

describe('runSkill', () => {
  it('does not call the handler when denied', async () => {
    const handler = vi.fn(async () => ({ secret: 'data' }))
    const skill = makeSkill({ requiredUserTypes: ['Admin'], handler })
    const result = (await runSkill(skill, {}, ctx({ type: 'User' }))) as { error: string }
    expect(result.error).toContain('requires user type')
    expect(handler).not.toHaveBeenCalled()
  })

  it('runs the handler when allowed', async () => {
    const handler = vi.fn(async () => ({ value: 1 }))
    const skill = makeSkill({ handler })
    expect(await runSkill(skill, {}, ctx({ type: 'Agent' }))).toEqual({ value: 1 })
    expect(handler).toHaveBeenCalledOnce()
  })
})
