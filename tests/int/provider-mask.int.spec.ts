// @vitest-environment node
import { getPayload, type Payload } from 'payload'
import { beforeAll, describe, expect, it } from 'vitest'

import config from '@/payload.config'
import { API_KEY_MASK } from '@/lib/api-key-mask'
import { resolveProviderApiKey } from '@/lib/provider-key'

let payload: Payload

describe('Provider API key masking (integration)', () => {
  beforeAll(async () => {
    payload = await getPayload({ config: await config })
  })

  it('masks on normal reads and reveals only for trusted reads', async () => {
    const stamp = Date.now()
    const provider = await payload.create({
      collection: 'providers',
      data: {
        name: `mask-${stamp}`,
        provider: 'openai',
        models: [{ modelId: 'gpt-4o' }],
        apiKey: 'sk-secret-value-123456',
        enabled: true,
      },
      overrideAccess: true,
    })

    const normal = await payload.findByID({
      collection: 'providers',
      id: provider.id,
      depth: 0,
      overrideAccess: true,
    })
    expect(normal.apiKey).toBe(API_KEY_MASK)

    const revealed = await payload.findByID({
      collection: 'providers',
      id: provider.id,
      depth: 0,
      overrideAccess: true,
      context: { revealApiKey: true },
    })
    expect(revealed.apiKey).toBe('sk-secret-value-123456')
    expect(resolveProviderApiKey(revealed)).toBe('sk-secret-value-123456')
  })

  it('preserves the stored key when the mask is submitted unchanged', async () => {
    const stamp = Date.now()
    const provider = await payload.create({
      collection: 'providers',
      data: {
        name: `mask-update-${stamp}`,
        provider: 'openai',
        models: [{ modelId: 'gpt-4o' }],
        apiKey: 'sk-keep-me-1234567890',
        enabled: true,
      },
      overrideAccess: true,
    })

    // Simulate the admin form saving the masked sentinel back.
    await payload.update({
      collection: 'providers',
      id: provider.id,
      data: { apiKey: API_KEY_MASK, baseUrl: 'https://example.com/v1' },
      overrideAccess: true,
    })

    const revealed = await payload.findByID({
      collection: 'providers',
      id: provider.id,
      depth: 0,
      overrideAccess: true,
      context: { revealApiKey: true },
    })
    expect(revealed.apiKey).toBe('sk-keep-me-1234567890')
  })
})
