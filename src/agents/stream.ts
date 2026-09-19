import type { BaseChatModel } from '@langchain/core/language_models/chat_models'
import {
  AIMessage,
  AIMessageChunk,
  ToolMessage,
} from '@langchain/core/messages'
import type { Payload } from 'payload'
import type { AgentRun } from '@/payload-types'

import { resolveAgentModel } from './model'
import {
  buildMessages,
  buildRunContext,
  executeTool,
  MAX_TOOL_ITERATIONS,
  sanitizeRunMessages,
  type RunTrigger,
} from './run'
import { createGuardrailEngine } from './guardrail-engine'
import { notifyFlaggedRun } from './alerts'
import { classifyInjection } from './semantic-guard'
import { maybeSummarizeSession } from '@/lib/agent-memory'
import { contentToText, resolveSession } from './shared'

/** Events emitted by the streaming agent method (SSE `data:` lines). */
export type AgentStreamEvent =
  | { type: 'token'; content: string }
  | { type: 'done'; runId: number; sessionId: string; output: string }
  | { type: 'error'; message: string }

export type StreamAgentArgs = {
  payload: Payload
  agentId: number
  input: string
  sessionId?: string
  triggeredBy?: RunTrigger
  /** Test seam: override the chat model. */
  model?: BaseChatModel
}

/** Encodes an event as an SSE `data:` frame. */
export function encodeSseEvent(event: AgentStreamEvent): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`)
}

/**
 * Framework streaming method: runs an agent and streams tokens as SSE frames.
 *
 * The channel (web SSE endpoint, WhatsApp adapter, …) is application-specific;
 * this method owns the streaming behaviour and persistence:
 *   - streams `token` events as the model produces text,
 *   - executes tool calls (same access-controlled skills as single-shot),
 *   - persists ChatSession/ChatMessages + an AgentRun trace,
 *   - emits a final `done` (or `error`) event.
 */
export async function streamAgentRun({
  payload,
  agentId,
  input,
  sessionId,
  triggeredBy = 'api',
  model: modelOverride,
}: StreamAgentArgs): Promise<ReadableStream<Uint8Array>> {
  const startedAt = new Date().toISOString()

  const run = await payload.create({
    collection: 'agent-runs',
    data: { agent: agentId, status: 'running', input, triggeredBy, startedAt },
    overrideAccess: true,
  })

  const encoder = new TextEncoder()

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: AgentStreamEvent) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))

      try {
        const { agent, tools, systemContent, history } = await buildRunContext(
          payload,
          agentId,
          input,
          sessionId,
        )

        const safetyMode = agent.safetyMode ?? 'monitor'
        const engine = await createGuardrailEngine({ payload, agentId, safetyMode })
        const inputScan = engine.scanInput(input)
        const enforce = safetyMode === 'enforce'

        const baseModel = modelOverride ?? resolveAgentModel(agent)

        if (agent.semanticSafety && safetyMode !== 'off') {
          const injection = await classifyInjection(baseModel, input)
          if (injection) {
            inputScan.flagged = true
            inputScan.blocked = true
            inputScan.reasons.push('semantic-injection')
          }
        }

        if (enforce && inputScan.blocked) {
          await payload
            .update({
              collection: 'agent-runs',
              id: run.id,
              data: {
                status: 'failed',
                error: `Blocked by guardrails: ${inputScan.reasons.join(', ')}`,
                flagged: true,
                flagReasons: inputScan.reasons.join(', '),
                completedAt: new Date().toISOString(),
              },
              overrideAccess: true,
            })
            .catch(() => undefined)
          await notifyFlaggedRun(payload, { runId: run.id, agentId, blocked: true, reasons: inputScan.reasons })
          send({ type: 'error', message: `Blocked by guardrails: ${inputScan.reasons.join(', ')}` })
          return
        }

        const model =
          tools.length > 0 && baseModel.bindTools ? baseModel.bindTools(tools) : baseModel

        const sanitized = sanitizeRunMessages(engine, systemContent, history, input)

        const messages = buildMessages(sanitized.systemContent, sanitized.history, sanitized.input)

        let output = ''
        let iterations = 0

        for (;;) {
          const stream = await model.stream(messages)
          let aggregate: AIMessageChunk | null = null

          for await (const chunk of stream) {
            const aiChunk = chunk as AIMessageChunk
            aggregate = aggregate ? aggregate.concat(aiChunk) : aiChunk
            const text = contentToText(aiChunk.content)
            if (text) {
              output += text
              // In enforce mode we buffer and redact before emitting tokens.
              if (!enforce) send({ type: 'token', content: text })
            }
          }

          const toolCalls = aggregate?.tool_calls ?? []
          if (toolCalls.length === 0 || iterations >= MAX_TOOL_ITERATIONS) break

          messages.push(aggregate as unknown as AIMessage)
          for (const call of toolCalls) {
            const result = await executeTool(tools, call.name, call.args)
            messages.push(
              new ToolMessage({
                content: typeof result === 'string' ? result : JSON.stringify(result),
                tool_call_id: call.id ?? call.name,
                name: call.name,
              }),
            )
          }
          iterations += 1
        }

        const redactions: string[] = []
        const policyReasons: string[] = []
        let outputBlocked = false
        let finalOutput = output
        if (safetyMode !== 'off') {
          const policy = engine.evaluateOutputPolicy(output)
          policyReasons.push(...policy.reasons)
          outputBlocked = policy.blocked

          const redacted = engine.redactOutput(output)
          finalOutput = redacted.text
          redactions.push(...redacted.redactions)
        }

        if (enforce && outputBlocked) {
          await payload
            .update({
              collection: 'agent-runs',
              id: run.id,
              data: {
                status: 'failed',
                error: `Blocked by guardrails (output): ${policyReasons.join(', ')}`,
                flagged: true,
                flagReasons: [...inputScan.reasons, ...sanitized.redactions, ...policyReasons].join(', '),
                completedAt: new Date().toISOString(),
              },
              overrideAccess: true,
            })
            .catch(() => undefined)
          await notifyFlaggedRun(payload, { runId: run.id, agentId, blocked: true, reasons: policyReasons })
          send({ type: 'error', message: `Blocked by guardrails (output): ${policyReasons.join(', ')}` })
          return
        }

        if (enforce) send({ type: 'token', content: finalOutput })

        const reasons = [...inputScan.reasons, ...sanitized.redactions, ...policyReasons, ...redactions]
        const flagged =
          inputScan.flagged ||
          sanitized.redactions.length > 0 ||
          policyReasons.length > 0 ||
          redactions.length > 0
        const flagReasons = reasons.join(', ')

        const session = await resolveSession(payload, agentId, sessionId)

        await payload.create({
          collection: 'chat-messages',
          data: { session: session.id, role: 'user', content: input },
          overrideAccess: true,
        })
        await payload.create({
          collection: 'chat-messages',
          data: { session: session.id, role: 'assistant', content: finalOutput },
          overrideAccess: true,
        })
        await payload.update({
          collection: 'agent-runs',
          id: run.id,
          data: {
            status: 'succeeded',
            output: finalOutput,
            completedAt: new Date().toISOString(),
            session: session.id,
            flagged,
            flagReasons,
          },
          overrideAccess: true,
        })

        if (flagged) {
          await notifyFlaggedRun(payload, { runId: run.id, agentId, blocked: false, reasons })
        }

        if (agent.capabilities?.includes('memory')) {
          await maybeSummarizeSession(payload, agentId, session.sessionId).catch(() => undefined)
        }

        send({ type: 'done', runId: run.id, sessionId: session.sessionId, output: finalOutput })
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        await payload
          .update({
            collection: 'agent-runs',
            id: run.id,
            data: { status: 'failed', error: message, completedAt: new Date().toISOString() },
            overrideAccess: true,
          })
          .catch(() => undefined)
        send({ type: 'error', message })
      } finally {
        controller.close()
      }
    },
  })
}

/** Convenience: drain a stream into the list of events (useful for tests/servers). */
export async function collectStreamEvents(
  stream: ReadableStream<Uint8Array>,
): Promise<AgentStreamEvent[]> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  const events: AgentStreamEvent[] = []
  let buffer = ''

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const frames = buffer.split('\n\n')
    buffer = frames.pop() ?? ''
    for (const frame of frames) {
      const line = frame.trim()
      if (!line.startsWith('data:')) continue
      try {
        events.push(JSON.parse(line.slice(5).trim()) as AgentStreamEvent)
      } catch {
        // ignore malformed frames
      }
    }
  }

  return events
}
