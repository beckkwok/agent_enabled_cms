// @vitest-environment node
import { AIMessage } from '@langchain/core/messages'
import { describe, expect, it } from 'vitest'

import { createGuardrailEngine } from '@/agents/guardrail-engine'
import { sanitizeRunMessages } from '@/agents/run'

function mockPayload(rules: unknown[] = []) {
  return {
    find: async ({ collection }: { collection: string }) =>
      collection === 'guardrails'
        ? { docs: rules }
        : { docs: [{ name: 'openai', keyRef: null, apiKey: 'secret-value-123456', enabled: true }] },
  } as never
}

describe('sanitizeRunMessages (outgoing-prompt defence-in-depth)', () => {
  it('redacts a secret from the system content and prefixes prompt:', async () => {
    const engine = await createGuardrailEngine({ payload: mockPayload(), safetyMode: 'monitor' })
    const result = sanitizeRunMessages(engine, 'Context: use secret-value-123456', [], 'hi')
    expect(result.systemContent).not.toContain('secret-value-123456')
    expect(result.systemContent).toContain('[REDACTED]')
    expect(result.redactions).toContain('prompt:configured-secret')
  })

  it('redacts a secret from history and preserves the message type', async () => {
    const engine = await createGuardrailEngine({ payload: mockPayload(), safetyMode: 'monitor' })
    const result = sanitizeRunMessages(engine, '', [new AIMessage('the key is secret-value-123456')], 'hi')
    expect(result.history[0]).toBeInstanceOf(AIMessage)
    expect(String(result.history[0].content)).not.toContain('secret-value-123456')
    expect(result.redactions).toContain('prompt:configured-secret')
  })

  it('redacts a secret from the new input', async () => {
    const engine = await createGuardrailEngine({ payload: mockPayload(), safetyMode: 'monitor' })
    const result = sanitizeRunMessages(engine, '', [], 'paste sk-abcdefghijklmnopqrstuvwxyz1234 now')
    expect(result.input).not.toContain('sk-abcdefghijklmnopqrstuvwxyz1234')
    expect(result.redactions).toContain('prompt:openai-key')
  })

  it('leaves emails (PII, not secrets) untouched in the prompt', async () => {
    const engine = await createGuardrailEngine({ payload: mockPayload(), safetyMode: 'monitor' })
    const result = sanitizeRunMessages(engine, 'Contact ada@example.com', [], 'hi')
    expect(result.systemContent).toContain('ada@example.com')
    expect(result.redactions).not.toContain('prompt:email')
  })

  it('returns no redactions for clean content', async () => {
    const engine = await createGuardrailEngine({ payload: mockPayload(), safetyMode: 'monitor' })
    const result = sanitizeRunMessages(engine, 'Hello world', [], 'hi there')
    expect(result.redactions).toEqual([])
    expect(result.systemContent).toBe('Hello world')
  })
})
