import OpenAI from 'openai'

export const EMBEDDING_MODEL = 'text-embedding-3-small'
export const EMBEDDING_DIMENSIONS = 1536

/** When set, embedTexts returns deterministic mock vectors instead of calling the API. */
export const MOCK_EMBEDDINGS = process.env.MOCK_EMBEDDINGS === '1'

let client: OpenAI | null = null

export function getOpenAIClient(): OpenAI {
  if (!client) {
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is not set. Add it to your .env file.')
    }
    client = new OpenAI({ apiKey })
  }
  return client
}

/**
 * Embeds a batch of strings. Returns vectors (number[]) in the same order as
 * input. Uses the default batch size of 128 for text-embedding-3-small.
 */
export async function embedTexts(texts: string[]): Promise<number[][]> {
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
  const openai = getOpenAIClient()
  const response = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: texts,
  })
  return response.data.map((item) => item.embedding)
}

/** Embeds a single string. */
export async function embedText(text: string): Promise<number[]> {
  const [vector] = await embedTexts([text])
  return vector
}
