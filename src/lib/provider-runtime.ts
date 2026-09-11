import { ChatOpenAI } from '@langchain/openai'
import OpenAI from 'openai'
import type { Agent, Provider } from '@/payload-types'

import { requireProviderApiKey } from './provider-key'

/**
 * Runtime resolution of a Provider record into concrete model/embedding
 * clients. This is the single place that maps the `Provider` collection
 * (provider type + keyRef/pasted key + baseUrl + models) to SDK clients, so
 * agent logic never hardcodes a vendor or reads env keys directly.
 *
 * See docs/provider-model.md.
 */

/** Fields needed to build a client from a Provider. */
export type ProviderRuntimeInput = Pick<
  Provider,
  'name' | 'provider' | 'keyRef' | 'apiKey' | 'baseUrl' | 'models'
>

/** Default base URL per provider type. `undefined` = SDK default. */
export const PROVIDER_BASE_URLS: Record<Provider['provider'], string | undefined> = {
  openai: undefined,
  deepseek: 'https://api.deepseek.com',
  anthropic: 'https://api.anthropic.com',
  local: undefined, // must be supplied via provider.baseUrl
}

/** Resolves the base URL: explicit `baseUrl` wins, else the provider default. */
export function resolveProviderBaseUrl(provider: ProviderRuntimeInput): string | undefined {
  return provider.baseUrl?.trim() || PROVIDER_BASE_URLS[provider.provider]
}

/**
 * Resolves the model id: explicit arg wins, else the first model on the
 * Provider, else a clear error.
 */
export function resolveProviderModel(provider: ProviderRuntimeInput, model?: string): string {
  const explicit = model?.trim()
  if (explicit) return explicit

  const fromList = provider.models?.map((m) => m?.modelId?.trim()).find(Boolean)
  if (fromList) return fromList

  throw new Error(
    `No model specified for provider "${provider.name}" and it has no models configured. Add a model to the Provider or pass one explicitly.`,
  )
}

export type ChatModelOptions = {
  model?: string
  temperature?: number
  streaming?: boolean
}

/**
 * Builds a LangChain chat model for an OpenAI-compatible provider
 * (openai / deepseek / local). Anthropic uses a different SDK and is not
 * wired yet.
 */
export function getChatModelForProvider(
  provider: ProviderRuntimeInput,
  options: ChatModelOptions = {},
): ChatOpenAI {
  if (provider.provider === 'anthropic') {
    throw new Error(
      'Anthropic chat is not supported yet. Install @langchain/anthropic and extend getChatModelForProvider, or use an OpenAI-compatible provider.',
    )
  }

  const apiKey = requireProviderApiKey(provider)
  const baseURL = resolveProviderBaseUrl(provider)

  return new ChatOpenAI({
    modelName: resolveProviderModel(provider, options.model),
    configuration: { apiKey, ...(baseURL ? { baseURL } : {}) },
    temperature: options.temperature,
    streaming: options.streaming ?? true,
  })
}

/** Builds an OpenAI SDK client for an OpenAI-compatible provider. */
export function getEmbeddingClientForProvider(provider: ProviderRuntimeInput): OpenAI {
  if (provider.provider === 'anthropic') {
    throw new Error(
      `Provider "${provider.name}" is Anthropic, which does not expose an OpenAI-compatible embeddings API.`,
    )
  }

  const apiKey = requireProviderApiKey(provider)
  const baseURL = resolveProviderBaseUrl(provider)

  return new OpenAI({ apiKey, ...(baseURL ? { baseURL } : {}) })
}

/** Resolves the embedding model id for a Provider. */
export function resolveEmbeddingModel(provider: ProviderRuntimeInput, model?: string): string {
  return resolveProviderModel(provider, model)
}

// ---------------------------------------------------------------------------
// Agent → Provider resolution
// ---------------------------------------------------------------------------

/** A populated (depth ≥ 1) Agent with its Provider relationship resolved. */
export type AgentWithProvider = Omit<Agent, 'provider'> & {
  provider?: (number | null) | Provider
}

/** Extracts the populated Provider from an Agent, or null if unresolved/absent. */
export function getAgentProvider(agent: AgentWithProvider): Provider | null {
  const { provider } = agent
  if (provider && typeof provider === 'object') return provider as Provider
  return null
}

/**
 * Builds a chat model for an Agent from its Provider + model.
 * Throws if the Agent has no provider configured.
 */
export function getChatModelForAgent(
  agent: AgentWithProvider,
  options: ChatModelOptions = {},
): ChatOpenAI {
  const provider = getAgentProvider(agent)
  if (!provider) {
    throw new Error(
      `Agent "${agent.name}" has no Provider configured. Set one in the Agent record (or populate the relationship with depth ≥ 1).`,
    )
  }

  return getChatModelForProvider(provider, {
    ...options,
    model: options.model ?? agent.model ?? undefined,
  })
}

