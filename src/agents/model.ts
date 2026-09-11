import type { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { FakeListChatModel } from '@langchain/core/utils/testing'

import { getChatModelForAgent, type AgentWithProvider } from '@/lib/provider-runtime'

/** When set, agent runs use a deterministic fake model (no network/keys). */
export function isMockLLM(): boolean {
  return process.env.MOCK_LLM === '1'
}

/**
 * Resolves the chat model for an agent from its Provider config.
 *
 * `MOCK_LLM=1` returns a fake model for tests/e2e so the full agent path can
 * run without a provider key or network access.
 */
export function resolveAgentModel(agent: AgentWithProvider): BaseChatModel {
  if (isMockLLM()) {
    return new FakeListChatModel({
      responses: ['[mock agent response]'],
    })
  }

  return getChatModelForAgent(agent, { streaming: false })
}
