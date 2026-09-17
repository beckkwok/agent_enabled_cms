// @vitest-environment node
import crypto from 'node:crypto'
import { sql } from '@payloadcms/db-postgres/drizzle'
import { getPayload, type Payload } from 'payload'
import { beforeAll, describe, expect, it } from 'vitest'

import config from '@/payload.config'
import { API_KEY_MASK } from '@/lib/api-key-mask'

const COLLECTION = 'payload-mcp-api-keys'
let payload: Payload
let principalId: number

describe('MCP API key masking (integration)', () => {
  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    const stamp = Date.now()
    const principal = await payload.create({
      collection: 'users',
      data: {
        email: `mcp-mask-${stamp}@test.local`,
        password: 'test-password',
        name: 'MCP Mask Principal',
        type: 'Agent',
      },
      overrideAccess: true,
    })
    principalId = principal.id
  })

  async function createKey(raw: string) {
    return payload.create({
      collection: COLLECTION,
      data: { label: `key-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, enableAPIKey: true, apiKey: raw, user: principalId },
      overrideAccess: true,
    })
  }

  it('masks on normal reads and reveals only for trusted reads', async () => {
    const raw = 'aacms_testkey_0123456789abcdef0123456789abcdef'
    const created = await createKey(raw)

    const normal = await payload.findByID({
      collection: COLLECTION,
      id: created.id,
      depth: 0,
      overrideAccess: true,
    })
    expect(normal.apiKey).toBe(API_KEY_MASK)

    const revealed = await payload.findByID({
      collection: COLLECTION,
      id: created.id,
      depth: 0,
      overrideAccess: true,
      context: { revealApiKey: true },
    })
    expect(revealed.apiKey).toBe(raw)
  })

  it('preserves the key and its HMAC index when the mask is submitted unchanged', async () => {
    const raw = 'aacms_keepkey_0123456789abcdef0123456789abcdef'
    const created = await createKey(raw)

    await payload.update({
      collection: COLLECTION,
      id: created.id,
      data: { apiKey: API_KEY_MASK, description: 'toggled a capability' },
      overrideAccess: true,
    })

    const revealed = await payload.findByID({
      collection: COLLECTION,
      id: created.id,
      depth: 0,
      overrideAccess: true,
      context: { revealApiKey: true },
    })
    expect(revealed.apiKey).toBe(raw)

    // The stored index must still match HMAC(secret, raw) so MCP auth keeps working.
    const expectedIndex = crypto
      .createHmac('sha256', payload.secret)
      .update(raw)
      .digest('hex')

    const result = await payload.db.execute({
      db: payload.db.drizzle,
      sql: sql`SELECT api_key_index FROM payload_mcp_api_keys WHERE id = ${created.id}`,
    })
    const rows = (Array.isArray(result) ? result : result.rows) as { api_key_index: string }[]
    expect(rows[0]?.api_key_index).toBe(expectedIndex)
  })
})
