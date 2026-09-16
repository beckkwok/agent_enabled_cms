import type { BaseChatModel } from '@langchain/core/language_models/chat_models'
import {
  AIMessage,
  HumanMessage,
  SystemMessage,
  ToolMessage,
  type BaseMessage,
} from '@langchain/core/messages'
import type { StructuredToolInterface } from '@langchain/core/tools'
import type { Payload } from 'payload'
import type { AgentRun } from '@/payload-types'

import { hybridSearch } from '@/lib/vectorSearch'
import { agentPromptToText } from './prompt'
import { resolveAgentModel } from './model'
import { buildAgentTools } from './skills/langchain'
import type { SkillContext } from './skills/types'
import { actingUserOf, contentToText, loadAgent, resolveSession } from './shared'

export type RunTrigger = NonNullable<AgentRun['triggeredBy']>

export type RunSingleShotArgs = {
  payload: Payload
  agentId: number
  input: string
  sessionId?: string
  triggeredBy?: RunTrigger
  /** When set, updates an existing AgentRun (e.g. one created by the API as queued). */
  runId?: number
  /** Test seam: override the chat model (e.g. a fake tool-calling model). */
  model?: BaseChatModel
}

export type RunSingleShotResult = {
  runId: number
  output: string
  sessionId: string
}

const MAX_TOOL_ITERATIONS = 5

export { MAX_TOOL_ITERATIONS }

/** Builds the system prompt + messages and the skill context for a run. */
export async function buildRunContext(payload: Payload, agentId: number, input: string) {
  const agent = await loadAgent(payload, agentId)
  const actingUser = actingUserOf(agent)

  const capabilities = agent.capabilities ?? []
  let context = ''
  if (capabilities.includes('knowledge')) {
    const matches = await hybridSearch(payload, input, { limit: 5, user: actingUser })
    context = matches.map((m, i) => `[${i + 1}] ${m.content}`).join('\n\n')
  }

  const systemParts = [agentPromptToText(agent.prompt)]
  if (context) systemParts.push(`Context:\n${context}`)
  const systemContent = systemParts.filter(Boolean).join('\n\n')

  const skillCtx: SkillContext = { payload, user: actingUser }
  const tools = buildAgentTools(agent.tools ?? [], skillCtx)

  return { agent, actingUser, skillCtx, tools, systemContent }
}

/** Executes a tool call and returns a JSON-serializable result (errors captured). */
export async function executeTool(
  tools: StructuredToolInterface[],
  name: string,
  args: unknown,
): Promise<unknown> {
  try {
    const found = tools.find((t) => t.name === name)
    return found ? await found.invoke(args as Record<string, unknown>) : { error: `Unknown tool: ${name}` }
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
}

/** Runs the model, executing any tool calls, until it returns a final answer. */
async function runWithTools(
  model: { invoke: (input: BaseMessage[]) => Promise<BaseMessage> },
  messages: BaseMessage[],
  tools: StructuredToolInterface[],
): Promise<BaseMessage> {
  let response = await model.invoke(messages)
  let iterations = 0

  while ((response as AIMessage).tool_calls?.length && iterations < MAX_TOOL_ITERATIONS) {
    const toolCalls = (response as AIMessage).tool_calls ?? []
    messages.push(response)
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
    response = await model.invoke(messages)
    iterations += 1
  }

  return response
}

/**
 * Runs an agent once (single-shot) and records an AgentRun trace.
 *
 * - `knowledge` capability → retrieve context from the framework Knowledge base.
 * - `tools` → bind the selected CMS skills so the model can call them; the
 *   agent acts as its own principal, so skill reads/writes are access-controlled.
 */
export async function runSingleShot({
  payload,
  agentId,
  input,
  sessionId,
  triggeredBy = 'api',
  runId,
  model: modelOverride,
}: RunSingleShotArgs): Promise<RunSingleShotResult> {
  const startedAt = new Date().toISOString()

  const run = runId
    ? await payload.update({
        collection: 'agent-runs',
        id: runId,
        data: { status: 'running', startedAt },
        overrideAccess: true,
      })
    : await payload.create({
        collection: 'agent-runs',
        data: { agent: agentId, status: 'running', input, triggeredBy, startedAt },
        overrideAccess: true,
      })

  try {
    const { agent, tools, systemContent } = await buildRunContext(payload, agentId, input)

    const baseModel = modelOverride ?? resolveAgentModel(agent)
    const model = tools.length > 0 && baseModel.bindTools ? baseModel.bindTools(tools) : baseModel

    const messages: BaseMessage[] = [
      ...(systemContent ? [new SystemMessage(systemContent)] : []),
      new HumanMessage(input),
    ]

    const response = await runWithTools(
      model as unknown as { invoke: (input: BaseMessage[]) => Promise<BaseMessage> },
      messages,
      tools,
    )
    const output = contentToText(response.content)

    const session = await resolveSession(payload, agentId, sessionId)

    await payload.create({
      collection: 'chat-messages',
      data: { session: session.id, role: 'user', content: input },
      overrideAccess: true,
    })
    await payload.create({
      collection: 'chat-messages',
      data: { session: session.id, role: 'assistant', content: output },
      overrideAccess: true,
    })

    await payload.update({
      collection: 'agent-runs',
      id: run.id,
      data: {
        status: 'succeeded',
        output,
        completedAt: new Date().toISOString(),
        session: session.id,
      },
      overrideAccess: true,
    })

    return { runId: run.id, output, sessionId: session.sessionId }
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
    throw err
  }
}
