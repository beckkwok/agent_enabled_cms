import { describe, it, expect, afterEach } from 'vitest'

import { resolveProviderApiKey, requireProviderApiKey } from '@/lib/provider-key'

const ENV_REF = 'TEST_PROVIDER_KEY'

describe('resolveProviderApiKey', () => {
  afterEach(() => {
    delete process.env[ENV_REF]
  })

  it('prefers the env var named by keyRef when set', () => {
    process.env[ENV_REF] = 'env-secret'
    const key = resolveProviderApiKey({ keyRef: ENV_REF, apiKey: 'pasted-secret' })
    expect(key).toBe('env-secret')
  })

  it('falls back to the pasted apiKey when the env var is missing', () => {
    delete process.env[ENV_REF]
    const key = resolveProviderApiKey({ keyRef: ENV_REF, apiKey: 'pasted-secret' })
    expect(key).toBe('pasted-secret')
  })

  it('falls back to the pasted apiKey when keyRef is not set', () => {
    const key = resolveProviderApiKey({ apiKey: 'pasted-secret' })
    expect(key).toBe('pasted-secret')
  })

  it('returns undefined when neither source yields a key', () => {
    expect(resolveProviderApiKey({ keyRef: null, apiKey: null })).toBeUndefined()
    expect(resolveProviderApiKey({})).toBeUndefined()
  })

  it('ignores blank / whitespace-only values', () => {
    process.env[ENV_REF] = '   '
    expect(resolveProviderApiKey({ keyRef: ENV_REF, apiKey: '   ' })).toBeUndefined()
  })
})

describe('requireProviderApiKey', () => {
  it('throws a descriptive error when no key is available', () => {
    expect(() => requireProviderApiKey({ name: 'openai', keyRef: null, apiKey: null })).toThrow(
      /No API key configured for provider "openai"/,
    )
  })

  it('returns the resolved key when available', () => {
    expect(requireProviderApiKey({ name: 'openai', keyRef: null, apiKey: 'pasted' })).toBe('pasted')
  })
})
