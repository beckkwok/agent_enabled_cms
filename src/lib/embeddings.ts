import OpenAI from 'openai'
import type { Provider } from '@/payload-types'

import { getEmbeddingClientForProvider, resolveEmbeddingModel } from './provider-runtime'

export const EMBEDDING_MODEL = 'text-embedding-3-small'
export const EMBEDDING_DIMENSIONS = 1536

/** When set, embedTexts returns deterministic mock vectors instead of calling the API. */
export const MOCK_EMBEDDINGS = process.env.MOCK_EMBEDDINGS === '1'

let envClient: OpenAI | null = null

/** Env-based OpenAI client — fallback when no Provider is configured. */
export function getOpenAIClient(): OpenAI {
  if (!envClient) {
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is not set. Add it to your .env file.')
    }
    envClient = new OpenAI({ apiKey })
  }
  return envClient
}

export type EmbedTextsOptions = {
  /** Provider to embed with. When omitted, falls back to env OPENAI_API_KEY. */
  provider?: Provider
  /** Overrides the model id (else the Provider's first model / env default). */
  model?: string
}

/**
 * Embeds a batch of strings. Returns vectors (number[]) in the same order as
 * input.
 *
 * When a Provider is given, its type/baseUrl/key (via `keyRef` or pasted key)
 * are used. Otherwise the env `OPENAI_API_KEY` fallback is used (blog path).
 */
export async function embedTexts(
  texts: string[],
  options: EmbedTextsOptions = {},
): Promise<number[][]> {
  if (texts.length === 0) return []

  if (MOCK_EMBEDDINGS) {
    // Deterministic pseudo-vectors derived from content hash so similar text
    // yields similar vectors (exercises the full pipeline without the API).
    return texts.map((text) => {
      let seed = 0
      for (let i = 0; i < text.length; i++) {
        seed = (seed * 31 + text.charCodeAt(i)) >>> 0
      }
      const vector: number[] = []
      for (let d = 0; d < EMBEDDING_DIMENSIONS; d++) {
        seed = (seed * 1103515245 + 12345) >>> 0
        vector.push((seed % 2000) / 1000 - 1)
      }
      return vector
    })
  }

  const { provider } = options
  const client = provider ? getEmbeddingClientForProvider(provider) : getOpenAIClient()
  const model = provider ? resolveEmbeddingModel(provider, options.model) : options.model || EMBEDDING_MODEL

  const response = await client.embeddings.create({
    model,
    input: texts,
  })
  return response.data.map((item) => item.embedding)
}

/** Embeds a single string. */
export async function embedText(text: string, options: EmbedTextsOptions = {}): Promise<number[]> {
  const [vector] = await embedTexts([text], options)
  return vector
}
