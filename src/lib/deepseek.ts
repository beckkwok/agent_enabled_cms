import OpenAI from 'openai'

export const DEEPSEEK_BASE_URL = 'https://api.deepseek.com'
export const DEEPSEEK_MODEL = 'deepseek-v4-pro'

let client: OpenAI | null = null

function getDeepSeekClient(): OpenAI {
  if (!client) {
    const apiKey = process.env.DEEPSEEK_API_KEY
    if (!apiKey) {
      throw new Error('DEEPSEEK_API_KEY is not set. Add it to your .env file.')
    }
    client = new OpenAI({
      apiKey,
      baseURL: DEEPSEEK_BASE_URL,
    })
  }
  return client
}

export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string }

/**
 * Sends a chat completion to DeepSeek. Returns the assistant text reply.
 */
export async function deepseekChat(messages: ChatMessage[]): Promise<string> {
  const openai = getDeepSeekClient()
  const response = await openai.chat.completions.create({
    model: DEEPSEEK_MODEL,
    messages,
    stream: false,
  })
  return response.choices[0]?.message?.content?.trim() || ''
}
