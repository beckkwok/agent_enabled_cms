import type { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { SystemMessage, type BaseMessage } from '@langchain/core/messages'

import { contentToText } from './shared'

const SUMMARIZE_PROMPT =
  'Summarize this conversation into durable long-term memory. Extract only stable facts and ' +
  'preferences (who, what, and how) that would be useful in future conversations. Omit secrets, ' +
  'credentials, and personal data. Reply with a single short paragraph.'

/**
 * Summarises a list of messages into a compact memory string using the given
 * model. Deterministic when a fake model is injected in tests.
 */
export async function summarizeMessages(
  model: BaseChatModel,
  messages: BaseMessage[],
): Promise<string> {
  const response = await model.invoke([new SystemMessage(SUMMARIZE_PROMPT), ...messages])
  return contentToText(response.content).trim()
}
