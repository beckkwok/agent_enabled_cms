// @vitest-environment node
import { getPayload, type Payload } from 'payload'
import { beforeAll, describe, expect, it } from 'vitest'

import config from '@/payload.config'
import { hybridSearch } from '@/lib/vectorSearch'

let payload: Payload
let userA: { id: number; collection?: string }
let userB: { id: number; collection?: string }

const QUERY = 'zorblax'

describe('retrieval access scoping (integration)', () => {
  beforeAll(async () => {
    process.env.MOCK_EMBEDDINGS = '1'
    payload = await getPayload({ config: await config })
    const stamp = Date.now()

    const a = await payload.create({
      collection: 'users',
      data: {
        email: `retrieval-a-${stamp}@test.local`,
        password: 'test-password',
        name: 'Retrieval A',
        type: 'User',
      },
      overrideAccess: true,
    })
    const b = await payload.create({
      collection: 'users',
      data: {
        email: `retrieval-b-${stamp}@test.local`,
        password: 'test-password',
        name: 'Retrieval B',
        type: 'User',
      },
      overrideAccess: true,
    })
    userA = { id: a.id, collection: 'users' }
    userB = { id: b.id, collection: 'users' }

    await payload.create({
      collection: 'knowledge',
      data: {
        title: `Public ${stamp}`,
        content: `The ${QUERY} keyword appears in the public document.`,
        visibility: 'public',
        _status: 'published',
      },
      overrideAccess: true,
    })

    await payload.create({
      collection: 'knowledge',
      data: {
        title: `Private ${stamp}`,
        content: `The ${QUERY} keyword also appears in the private document.`,
        visibility: 'private',
        owner: a.id,
        _status: 'published',
      },
      overrideAccess: true,
    })

    // Indexing runs in the queue (reindexKnowledge job) — process it now.
    await payload.jobs.run({ limit: 10 })
  })

  it('anonymous callers never retrieve private knowledge', async () => {
    const results = await hybridSearch(payload, QUERY, { user: null, limit: 10 })
    expect(results.some((r) => r.content.includes('private document'))).toBe(false)
  })

  it('the owner retrieves their private knowledge', async () => {
    const results = await hybridSearch(payload, QUERY, { user: userA as never, limit: 10 })
    const contents = results.map((r) => r.content).join(' ')
    expect(contents).toContain('private document')
  })

  it('another authenticated user does not retrieve the private knowledge', async () => {
    const results = await hybridSearch(payload, QUERY, { user: userB as never, limit: 10 })
    expect(results.some((r) => r.content.includes('private document'))).toBe(false)
  })
})
