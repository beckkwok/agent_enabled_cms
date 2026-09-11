import { test, expect } from '@playwright/test'
import { getPayload } from 'payload'

import config from '../../src/payload.config.js'
import { plainTextToLexical } from '../../src/lib/lexical'

const BASE = 'http://localhost:3000'

let publicAgentId: number
let authAgentId: number

test.describe('Agent run endpoint (agent ↔ CMS)', () => {
  test.beforeAll(async () => {
    const payload = await getPayload({ config: await config })
    const stamp = Date.now()

    const principal = await payload.create({
      collection: 'users',
      data: {
        email: `e2e-agent-${stamp}@test.local`,
        password: 'test-password',
        name: 'E2E Agent',
        type: 'Agent',
      },
      overrideAccess: true,
    })

    const base = {
      kind: 'single-shot' as const,
      status: 'active' as const,
      capabilities: ['knowledge'] as 'knowledge'[],
      user: principal.id,
      prompt: plainTextToLexical('You are an e2e test agent.'),
    }

    const publicAgent = await payload.create({
      collection: 'agents',
      data: { ...base, name: `E2E Public ${stamp}`, runAccess: 'public' },
      overrideAccess: true,
    })
    publicAgentId = publicAgent.id

    const authAgent = await payload.create({
      collection: 'agents',
      data: { ...base, name: `E2E Auth ${stamp}`, runAccess: 'authenticated' },
      overrideAccess: true,
    })
    authAgentId = authAgent.id
  })

  test('public agent validates input (400 on empty)', async ({ request }) => {
    const res = await request.post(`${BASE}/api/agents/${publicAgentId}/run`, {
      data: { input: '' },
    })
    expect(res.status()).toBe(400)
  })

  test('authenticated agent rejects anonymous callers (401)', async ({ request }) => {
    const res = await request.post(`${BASE}/api/agents/${authAgentId}/run`, {
      data: { input: 'hello' },
    })
    expect(res.status()).toBe(401)
  })

  test('MCP rejects requests without an API key (401)', async ({ request }) => {
    const res = await request.post(`${BASE}/api/mcp`, {
      data: { jsonrpc: '2.0', id: '1', method: 'tools/list' },
    })
    expect(res.status()).toBe(401)
  })
})
