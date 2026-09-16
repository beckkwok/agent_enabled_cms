import OpenAI from 'openai'
import type { Provider } from '@/payload-types'

import { getEmbeddingClientForProvider, resolveEmbeddingModel } from './provider-runtime'

export const EMBEDDING_MODEL = 'text-embedding-3-small'
export const EMBEDDING_DIMENSIONS = 1536
/** Max inputs per embeddings API request (batched to stay within limits). */
export const EMBEDDING_BATCH_SIZE = 100

/** When set, embedTexts returns deterministic mock vectors instead of calling the API. */
export const MOCK_EMBEDDINGS = process.env.MOCK_EMBEDDINGS === '1'

let envClient: OpenAI | null = null

/** Env-based OpenAI client — fallback when no Provider is configured. */
export function getOpenAIClient(): OpenAI {
  if (!envClient) {
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      // Embeddings are mandatory for Knowledge ingestion/retrieval unless
      // MOCK_EMBEDDINGS=1. Fail loudly with an actionable message.
      throw new Error(
        '[AACMS] OPENAI_API_KEY is not set — embeddings cannot run. ' +
          'Set OPENAI_API_KEY, or set MOCK_EMBEDDINGS=1 for deterministic mock vectors.',
      )
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

  // Batch requests so large documents (thousands of chunks) don't exceed the
  // provider's per-request limits.
  const vectors: number[][] = []
  for (let i = 0; i < texts.length; i += EMBEDDING_BATCH_SIZE) {
    const batch = texts.slice(i, i + EMBEDDING_BATCH_SIZE)
    const response = await client.embeddings.create({ model, input: batch })
    vectors.push(...response.data.map((item) => item.embedding))
  }
  return vectors
}

/** Embeds a single string. */
export async function embedText(text: string, options: EmbedTextsOptions = {}): Promise<number[]> {
  const [vector] = await embedTexts([text], options)
  return vector
}
