// @vitest-environment node
import { describe, it, expect, afterEach } from 'vitest'

import {
  getAgentProvider,
  getChatModelForAgent,
  getChatModelForProvider,
  getEmbeddingClientForProvider,
  resolveEmbeddingModel,
  resolveProviderBaseUrl,
  resolveProviderModel,
} from '@/lib/provider-runtime'

const ENV_REF = 'TEST_RUNTIME_KEY'

type ProviderInput = Parameters<typeof getChatModelForProvider>[0]

function makeProvider(overrides: Partial<ProviderInput> = {}): ProviderInput {
  return {
    name: 'openai-prod',
    provider: 'openai',
    keyRef: null,
    apiKey: 'pasted-key',
    baseUrl: null,
    models: [{ modelId: 'gpt-4o' }],
    ...overrides,
  } as ProviderInput
}

describe('resolveProviderBaseUrl', () => {
  it('uses the explicit baseUrl when set', () => {
    expect(resolveProviderBaseUrl(makeProvider({ baseUrl: 'https://custom.example/v1' }))).toBe(
      'https://custom.example/v1',
    )
  })

  it('falls back to the provider-type default', () => {
    expect(resolveProviderBaseUrl(makeProvider({ provider: 'deepseek' }))).toBe(
      'https://api.deepseek.com',
    )
    expect(resolveProviderBaseUrl(makeProvider({ provider: 'openai' }))).toBeUndefined()
  })
})

describe('resolveProviderModel', () => {
  it('prefers an explicit model', () => {
    expect(resolveProviderModel(makeProvider(), 'gpt-4o-mini')).toBe('gpt-4o-mini')
  })

  it('falls back to the first model on the provider', () => {
    expect(
      resolveProviderModel(makeProvider({ models: [{ modelId: 'a' }, { modelId: 'b' }] })),
    ).toBe('a')
  })

  it('throws when no model is available', () => {
    expect(() => resolveProviderModel(makeProvider({ models: null }))).toThrow(/No model specified/)
  })
})

describe('getChatModelForProvider', () => {
  afterEach(() => {
    delete process.env[ENV_REF]
  })

  it('builds a ChatOpenAI with the provider model + pasted key', () => {
    const model = getChatModelForProvider(makeProvider())
    expect(model.model).toBe('gpt-4o')
  })

  it('resolves the key from keyRef env before the pasted key', () => {
    process.env[ENV_REF] = 'env-key'
    // Should not throw; key resolution succeeds from env.
    const model = getChatModelForProvider(makeProvider({ keyRef: ENV_REF }))
    expect(model).toBeDefined()
  })

  it('throws for anthropic (not yet supported)', () => {
    expect(() => getChatModelForProvider(makeProvider({ provider: 'anthropic' }))).toThrow(
      /Anthropic chat is not supported/,
    )
  })

  it('throws when no key is resolvable', () => {
    expect(() =>
      getChatModelForProvider(makeProvider({ keyRef: null, apiKey: null })),
    ).toThrow(/No API key configured/)
  })
})

describe('getEmbeddingClientForProvider', () => {
  it('builds an OpenAI client for openai-compatible providers', () => {
    expect(getEmbeddingClientForProvider(makeProvider())).toBeDefined()
  })

  it('throws for anthropic', () => {
    expect(() => getEmbeddingClientForProvider(makeProvider({ provider: 'anthropic' }))).toThrow(
      /does not expose an OpenAI-compatible embeddings API/,
    )
  })
})

describe('resolveEmbeddingModel', () => {
  it('resolves the provider model', () => {
    expect(resolveEmbeddingModel(makeProvider({ models: [{ modelId: 'text-embedding-3-small' }] }))).toBe(
      'text-embedding-3-small',
    )
  })
})

describe('Agent → Provider', () => {
  const provider = makeProvider()

  it('extracts a populated provider', () => {
    const agent = { name: 'A', provider, model: 'gpt-4o' } as unknown as Parameters<
      typeof getAgentProvider
    >[0]
    expect(getAgentProvider(agent)).toBe(provider)
  })

  it('returns null when provider is an id or absent', () => {
    expect(getAgentProvider({ name: 'A', provider: 3 } as never)).toBeNull()
    expect(getAgentProvider({ name: 'A', provider: null } as never)).toBeNull()
  })

  it('builds a chat model for the agent using its provider + model', () => {
    const agent = { name: 'A', provider, model: 'gpt-4o-mini' } as unknown as Parameters<
      typeof getChatModelForAgent
    >[0]
    expect(getChatModelForAgent(agent).model).toBe('gpt-4o-mini')
  })

  it('throws when the agent has no provider', () => {
    const agent = { name: 'A', provider: null } as unknown as Parameters<typeof getChatModelForAgent>[0]
    expect(() => getChatModelForAgent(agent)).toThrow(/has no Provider configured/)
  })
})
