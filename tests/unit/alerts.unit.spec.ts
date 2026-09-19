// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest'

import { notifyFlaggedRun, setAlertNotifier, type FlaggedRunAlert } from '@/agents/alerts'

type Logs = { warn: string[]; error: string[] }
function fakePayload(logs: Logs) {
  return {
    logger: {
      warn: (m: string) => logs.warn.push(m),
      error: (m: string) => logs.error.push(m),
    },
  } as never
}

afterEach(() => setAlertNotifier(null))

describe('flagged-run alerting', () => {
  it('logs warn for a flagged (non-blocked) run by default', async () => {
    const logs: Logs = { warn: [], error: [] }
    await notifyFlaggedRun(fakePayload(logs), {
      runId: 1,
      agentId: 2,
      blocked: false,
      reasons: ['email'],
    })
    expect(logs.warn).toHaveLength(1)
    expect(logs.warn[0]).toContain('flagged')
    expect(logs.error).toHaveLength(0)
  })

  it('logs error for a blocked run by default', async () => {
    const logs: Logs = { warn: [], error: [] }
    await notifyFlaggedRun(fakePayload(logs), {
      runId: 1,
      agentId: 2,
      blocked: true,
      reasons: ['prompt-injection:dan'],
    })
    expect(logs.error).toHaveLength(1)
    expect(logs.error[0]).toContain('BLOCKED')
    expect(logs.warn).toHaveLength(0)
  })

  it('delegates to a custom notifier when installed', async () => {
    const received: FlaggedRunAlert[] = []
    setAlertNotifier(async (a) => {
      received.push(a)
    })
    await notifyFlaggedRun(fakePayload({ warn: [], error: [] }), {
      runId: 7,
      agentId: 9,
      blocked: false,
      reasons: ['custom:bank-acct'],
    })
    expect(received).toEqual([{ runId: 7, agentId: 9, blocked: false, reasons: ['custom:bank-acct'] }])
  })

  it('restores the default logger when the notifier is cleared', async () => {
    setAlertNotifier(async () => {})
    setAlertNotifier(null)
    const logs: Logs = { warn: [], error: [] }
    await notifyFlaggedRun(fakePayload(logs), {
      runId: 1,
      agentId: 2,
      blocked: false,
      reasons: ['email'],
    })
    expect(logs.warn).toHaveLength(1)
  })

  it('keeps raw input/output out of the default log line', async () => {
    const logs: Logs = { warn: [], error: [] }
    await notifyFlaggedRun(fakePayload(logs), {
      runId: 1,
      agentId: 2,
      blocked: false,
      reasons: ['email'],
    })
    expect(logs.warn[0]).not.toContain('ada@example.com')
  })
})
