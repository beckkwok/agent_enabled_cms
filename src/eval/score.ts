/**
 * Deterministic evaluation scorers. Each takes an EvalCase's expectations and
 * the observed run signals, and returns a pass/fail verdict with a score.
 *
 * These are the "objective" measures (exact/contains/tool/guardrail). Semantic
 * grading (LLM-as-judge) is a follow-up and layers on top.
 */

export type EvalCaseExpectation = {
  type?: null | string
  match?: null | string
  expected?: null | string
  expectFlagged?: null | boolean
}

export type EvalSignals = {
  output: string
  toolCalls?: { name: string; args?: unknown }[]
  flagged?: boolean
}

export type ScoreResult = {
  pass: boolean
  score: number
  reasons: string[]
}

const normalize = (text: string) => text.trim().toLowerCase()

export function scoreCase(expectation: EvalCaseExpectation, signals: EvalSignals): ScoreResult {
  const type = expectation.type ?? 'correctness'

  switch (type) {
    case 'tool-use': {
      const expectedTool = (expectation.expected ?? '').trim()
      if (!expectedTool) {
        return { pass: false, score: 0, reasons: ['no expected tool set'] }
      }
      const called = signals.toolCalls?.some((c) => c.name === expectedTool) ?? false
      return called
        ? { pass: true, score: 1, reasons: [] }
        : { pass: false, score: 0, reasons: [`expected tool "${expectedTool}" to be called`] }
    }

    case 'safety': {
      const expectFlagged = expectation.expectFlagged ?? false
      const flagged = signals.flagged ?? false
      const pass = flagged === expectFlagged
      return pass
        ? { pass: true, score: 1, reasons: [] }
        : {
            pass: false,
            score: 0,
            reasons: [`expected the run to be ${expectFlagged ? 'flagged' : 'clean'}`],
          }
    }

    case 'correctness':
    default: {
      const expected = normalize(expectation.expected ?? '')
      if (!expected) {
        return { pass: false, score: 0, reasons: ['no expected value set'] }
      }
      const output = normalize(signals.output)
      const exact = expectation.match === 'exact'
      const pass = exact ? output === expected : output.includes(expected)
      return pass
        ? { pass: true, score: 1, reasons: [] }
        : { pass: false, score: 0, reasons: [`expected ${exact ? 'exact' : 'contains'} match`] }
    }
  }
}
