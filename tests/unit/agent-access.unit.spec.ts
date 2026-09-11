import { describe, it, expect } from 'vitest'

import { checkAgentRunAccess } from '@/agents/access'

const anon = { user: null } as never
const user = { user: { collection: 'users', type: 'User', id: 2 } } as never
const agentUser = { user: { collection: 'users', type: 'Agent', id: 3 } } as never
const admin = { user: { collection: 'users', type: 'Admin', id: 1 } } as never

describe('checkAgentRunAccess', () => {
  it('public allows anyone', () => {
    expect(checkAgentRunAccess({ runAccess: 'public' }, anon)).toEqual({ ok: true })
  })

  it('authenticated requires a logged-in principal', () => {
    expect(checkAgentRunAccess({ runAccess: 'authenticated' }, anon).ok).toBe(false)
    expect(checkAgentRunAccess({ runAccess: 'authenticated' }, user)).toEqual({ ok: true })
    expect(checkAgentRunAccess({ runAccess: 'authenticated' }, agentUser)).toEqual({ ok: true })
  })

  it('admin allows only Admin principals', () => {
    const denied = checkAgentRunAccess({ runAccess: 'admin' }, user)
    expect(denied.ok).toBe(false)
    if (!denied.ok) expect(denied.status).toBe(403)
    expect(checkAgentRunAccess({ runAccess: 'admin' }, admin)).toEqual({ ok: true })
  })

  it('defaults to authenticated when runAccess is unset', () => {
    expect(checkAgentRunAccess({ runAccess: undefined }, anon).ok).toBe(false)
    expect(checkAgentRunAccess({ runAccess: undefined }, user)).toEqual({ ok: true })
  })

  it('returns 401 (not 403) for anonymous on authenticated/admin', () => {
    const result = checkAgentRunAccess({ runAccess: 'admin' }, anon)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.status).toBe(401)
  })
})
