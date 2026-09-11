import { ChatOpenAI } from '@langchain/openai'
import type { Provider } from '@/payload-types'

import { getChatModelForProvider, type ChatModelOptions } from './provider-runtime'

export const DEEPSEEK_BASE_URL = 'https://api.deepseek.com'
export const DEEPSEEK_MODEL = 'deepseek-v4-pro'

export type GetChatModelOptions = ChatModelOptions & {
  /** Provider to use. When omitted, falls back to env DEEPSEEK_API_KEY. */
  provider?: Provider
}

/**
 * Builds a chat model.
 *
 * When a Provider is given, its type/baseUrl/key (via `keyRef` or pasted key)
 * and model are used (docs/provider-model.md). Otherwise the env
 * DEEPSEEK_API_KEY fallback is used (blog `/api/ask` path).
 */
export function getChatModel(options: GetChatModelOptions = {}): ChatOpenAI {
  const { provider, ...rest } = options

  if (provider) {
    return getChatModelForProvider(provider, rest)
  }

  return new ChatOpenAI({
    modelName: DEEPSEEK_MODEL,
    configuration: {
      baseURL: DEEPSEEK_BASE_URL,
      apiKey: process.env.DEEPSEEK_API_KEY,
    },
    temperature: options.temperature,
    streaming: options.streaming ?? true,
  })
}

export function buildSystemPrompt(): string {
  return (
    'You are a helpful assistant on this site, answering from the provided knowledge base. ' +
    'Answer ONLY from the provided context excerpts. If the context does not contain the answer, ' +
    'say you are not sure and do not invent details. Be concise and clear. ' +
    'Never mention that you were given context excerpts.'
  )
}
