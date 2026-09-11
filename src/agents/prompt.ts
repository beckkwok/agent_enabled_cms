import type { Agent } from '@/payload-types'

import { lexicalToPlainText } from '@/lib/lexical'

/**
 * Extracts the plain-text system prompt from an Agent's rich-text `prompt`
 * field. Returns '' when unset or unparseable.
 */
export function agentPromptToText(prompt: Agent['prompt']): string {
  if (!prompt) return ''
  try {
    return lexicalToPlainText(prompt).trim()
  } catch {
    return ''
  }
}
