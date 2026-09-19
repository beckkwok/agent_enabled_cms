import type { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { HumanMessage, SystemMessage } from '@langchain/core/messages'

import { contentToText } from '@/agents/shared'

const JUDGE_PROMPT =
  'You are an evaluator grading an assistant\u2019s answer against the expected answer. ' +
  'Consider meaning, not exact wording. Respond ONLY with compact JSON: {"correct": true, "score": 0.8}'

export type JudgeVerdict = { pass: boolean; score: number; reason: string }

/**
 * Semantic (LLM-as-judge) correctness scorer. Grades meaning, so paraphrases
 * and synonyms that the deterministic scorers would miss are still credited.
 * Opt-in per case (`EvalCase.match: 'judge'`); costs one extra model call.
 *
 * Fails closed (non-pass) on any error so a broken judge can never mark a case
 * as passing.
 */
export async function judgeCorrectness(
  model: BaseChatModel,
  { input, expected, output }: { input: string; expected: string; output: string },
): Promise<JudgeVerdict> {
  try {
    const response = await model.invoke([
      new SystemMessage(JUDGE_PROMPT),
      new HumanMessage(`Question: ${input}\nExpected answer: ${expected}\nAssistant answer: ${output}`),
    ])

    const content = contentToText(response.content)
    const match = content.match(/\{[\s\S]*?\}/)
    if (!match) return { pass: false, score: 0, reason: 'judge: no verdict' }

    const parsed = JSON.parse(match[0]) as { correct?: boolean; score?: number }
    const score =
      typeof parsed.score === 'number' ? Math.min(Math.max(parsed.score, 0), 1) : parsed.correct ? 1 : 0
    const pass = parsed.correct === true || score >= 0.5

    return { pass, score, reason: pass ? '' : 'judge: incorrect' }
  } catch (err) {
    return { pass: false, score: 0, reason: `judge error: ${err instanceof Error ? err.message : String(err)}` }
  }
}
