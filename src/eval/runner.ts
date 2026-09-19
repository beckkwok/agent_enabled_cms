import type { BaseChatModel } from '@langchain/core/language_models/chat_models'
import type { Payload } from 'payload'

import { resolveAgentModel } from '@/agents/model'
import { runSingleShot } from '@/agents/run'
import { loadAgent } from '@/agents/shared'
import { judgeCorrectness } from './judge'
import { scoreCase } from './score'

/**
 * Executes an `EvalRun`: runs each of the agent's enabled `EvalCase`s through
 * the agent runtime, scores the result (deterministically, or via the LLM
 * judge for `match: 'judge'` cases), writes an `EvalResult`, aggregates the
 * pass rate/score onto the `EvalRun`, and applies the gate.
 *
 * `model` / `judgeModel` are test seams — omitted, the agent's own model is
 * used (or the `MOCK_LLM` fake in tests).
 */
export async function runEvaluation(
  payload: Payload,
  evalRunId: number,
  { model, judgeModel }: { model?: BaseChatModel; judgeModel?: BaseChatModel } = {},
): Promise<void> {
  const evalRun = await payload.findByID({
    collection: 'eval-runs',
    id: evalRunId,
    depth: 0,
    overrideAccess: true,
  })
  const agentId = evalRun.agent as number
  const agent = await loadAgent(payload, agentId)

  const judge = judgeModel ?? model ?? resolveAgentModel(agent)

  await payload.update({
    collection: 'eval-runs',
    id: evalRunId,
    data: { status: 'running' },
    overrideAccess: true,
  })

  const cases = await payload.find({
    collection: 'eval-cases',
    where: { agent: { equals: agentId }, enabled: { equals: true } },
    limit: 500,
    depth: 0,
    overrideAccess: true,
  })

  let passed = 0
  let sumScore = 0

  for (const c of cases.docs) {
    let pass = false
    let score = 0
    let reasons = ''
    let output = ''
    let toolCalls = ''
    let flagged = false
    let flagReasons = ''
    let agentRunId: number | undefined

    try {
      const result = await runSingleShot({ payload, agentId, input: c.input ?? '', model })
      output = result.output
      toolCalls = JSON.stringify(result.toolCalls ?? [])
      flagged = result.flagged
      flagReasons = result.flagReasons
      agentRunId = result.runId

      if (c.type === 'correctness' && c.match === 'judge') {
        const v = await judgeCorrectness(judge, {
          input: c.input ?? '',
          expected: c.expected ?? '',
          output: result.output,
        })
        pass = v.pass
        score = v.score
        reasons = v.reason
      } else {
        const s = scoreCase(c as never, {
          output: result.output,
          toolCalls: result.toolCalls,
          flagged: result.flagged,
        })
        pass = s.pass
        score = s.score
        reasons = s.reasons.join(', ')
      }
    } catch (err) {
      reasons = `error: ${err instanceof Error ? err.message : String(err)}`
    }

    await payload.create({
      collection: 'eval-results',
      data: {
        evalRun: evalRunId,
        case: c.id,
        agent: agentId,
        agentRun: agentRunId,
        output,
        toolCalls,
        flagged,
        flagReasons,
        pass,
        score,
        reasons,
      },
      overrideAccess: true,
    })

    if (pass) passed += 1
    sumScore += score
  }

  const total = cases.docs.length
  const score = total > 0 ? sumScore / total : 0
  const passThreshold = evalRun.passThreshold ?? 1
  const gatePassed = total > 0 && score >= passThreshold

  await payload.update({
    collection: 'eval-runs',
    id: evalRunId,
    data: {
      status: 'succeeded',
      caseCount: total,
      passed,
      failed: total - passed,
      score,
      gatePassed,
      completedAt: new Date().toISOString(),
    },
    overrideAccess: true,
  })

  if (agent.gateEnforced && !gatePassed) {
    await payload.update({
      collection: 'agents',
      id: agentId,
      data: { status: 'inactive' },
      overrideAccess: true,
    })
    payload.logger.warn(
      `[AACMS] agent ${agentId} failed its eval gate (score ${score} < ${passThreshold}) and was deactivated`,
    )
  }
}

/**
 * Creates a queued `EvalRun` for an agent (defaulting to all its enabled
 * `EvalCase`s) and enqueues the `runEval` job. Returns the run id.
 */
export async function createEvaluation(
  payload: Payload,
  agentId: number,
  name: string,
): Promise<number> {
  const run = await payload.create({
    collection: 'eval-runs',
    data: { name, agent: agentId, status: 'queued' },
    overrideAccess: true,
    context: { skipEval: true },
  })

  await payload.jobs.queue({
    task: 'runEval',
    input: { evalRunId: run.id },
    overrideAccess: true,
  })

  return run.id
}
