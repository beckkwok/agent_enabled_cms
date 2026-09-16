// @vitest-environment node
import { getPayload, type Payload } from 'payload'
import { beforeAll, describe, expect, it } from 'vitest'

import config from '@/payload.config'

let payload: Payload

describe('knowledge reindex job (integration)', () => {
  beforeAll(async () => {
    process.env.MOCK_EMBEDDINGS = '1'
    payload = await getPayload({ config: await config })
  })

  it('indexes a published knowledge doc via the queue job', async () => {
    const stamp = Date.now()
    const doc = await payload.create({
      collection: 'knowledge',
      data: {
        title: `Reindex ${stamp}`,
        content: 'Alpha beta gamma. '.repeat(50),
        visibility: 'public',
        _status: 'published',
      },
      overrideAccess: true,
    })

    await payload.jobs.run({ limit: 10 })

    const updated = await payload.findByID({
      collection: 'knowledge',
      id: doc.id,
      depth: 0,
      overrideAccess: true,
    })
    expect(updated.indexStatus).toBe('indexed')
    expect(updated.chunkCount).toBeGreaterThan(0)
    expect(updated.extractedText).toContain('Alpha beta gamma')

    const chunks = await payload.find({
      collection: 'knowledge-chunks',
      where: { knowledge: { equals: doc.id } },
      overrideAccess: true,
    })
    expect(chunks.totalDocs).toBe(updated.chunkCount)
  })

  it('does not index drafts', async () => {
    const stamp = Date.now()
    const doc = await payload.create({
      collection: 'knowledge',
      data: {
        title: `Draft ${stamp}`,
        content: 'not published',
        visibility: 'public',
        _status: 'draft',
      },
      overrideAccess: true,
    })

    await payload.jobs.run({ limit: 10 })

    const updated = await payload.findByID({
      collection: 'knowledge',
      id: doc.id,
      depth: 0,
      overrideAccess: true,
    })
    expect(updated.indexStatus).toBe('idle')
    expect(updated.chunkCount).toBe(0)
  })
})
