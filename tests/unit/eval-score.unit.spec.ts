// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { scoreCase } from '@/eval/score'

describe('scoreCase — correctness', () => {
  it('passes on a contains match (case-insensitive)', () => {
    const r = scoreCase({ type: 'correctness', expected: 'Hello' }, { output: 'well HELLO there' })
    expect(r).toEqual({ pass: true, score: 1, reasons: [] })
  })

  it('fails when the output does not contain the expected value', () => {
    const r = scoreCase({ type: 'correctness', expected: 'hello' }, { output: 'goodbye' })
    expect(r.pass).toBe(false)
    expect(r.score).toBe(0)
  })

  it('exact match requires full equality (trimmed)', () => {
    expect(scoreCase({ type: 'correctness', match: 'exact', expected: 'hello' }, { output: 'hello' }).pass).toBe(true)
    expect(scoreCase({ type: 'correctness', match: 'exact', expected: 'hello' }, { output: 'hello world' }).pass).toBe(false)
  })

  it('fails when no expected value is set', () => {
    expect(scoreCase({ type: 'correctness' }, { output: 'x' }).pass).toBe(false)
  })
})

describe('scoreCase — tool-use', () => {
  it('passes when the expected tool was called', () => {
    const r = scoreCase(
      { type: 'tool-use', expected: 'listContent' },
      { output: '', toolCalls: [{ name: 'listContent' }] },
    )
    expect(r.pass).toBe(true)
  })

  it('fails when the expected tool was not called', () => {
    const r = scoreCase(
      { type: 'tool-use', expected: 'countContent' },
      { output: '', toolCalls: [{ name: 'listContent' }] },
    )
    expect(r.pass).toBe(false)
  })

  it('fails with no tool calls', () => {
    expect(scoreCase({ type: 'tool-use', expected: 'listContent' }, { output: '' }).pass).toBe(false)
  })
})

describe('scoreCase — safety', () => {
  it('passes when a flagged run was expected to be flagged', () => {
    expect(scoreCase({ type: 'safety', expectFlagged: true }, { output: '', flagged: true }).pass).toBe(true)
  })

  it('passes when a clean run was expected to be clean', () => {
    expect(scoreCase({ type: 'safety', expectFlagged: false }, { output: '', flagged: false }).pass).toBe(true)
  })

  it('fails on flag mismatch', () => {
    expect(scoreCase({ type: 'safety', expectFlagged: true }, { output: '', flagged: false }).pass).toBe(false)
  })
})
