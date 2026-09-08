import { ChatOpenAI } from '@langchain/openai'

export const DEEPSEEK_BASE_URL = 'https://api.deepseek.com'
export const DEEPSEEK_MODEL = 'deepseek-v4-pro'

// TODO(framework): model/provider config should be read from the Agent
// record + Provider collection (docs/provider-model.md), not hardcoded env
// constants. This getter will resolve an Agent's provider → keyRef → model.
export function getChatModel(temperature?: number): ChatOpenAI {
  return new ChatOpenAI({
    modelName: DEEPSEEK_MODEL,
    configuration: {
      baseURL: DEEPSEEK_BASE_URL,
      apiKey: process.env.DEEPSEEK_API_KEY,
    },
    temperature,
    streaming: true,
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