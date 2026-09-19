import type { Payload } from 'payload'

/** Alert payload emitted when a run is flagged or blocked by guardrails. */
export type FlaggedRunAlert = {
  runId: number
  agentId: number
  blocked: boolean
  reasons: string[]
}

export type AlertNotifier = (alert: FlaggedRunAlert) => void | Promise<void>

let notifier: AlertNotifier | null = null

/**
 * Install a custom notifier (Slack, webhook, log sink, …). The default is the
 * framework logger: `error` for blocked runs, `warn` for flagged runs.
 * Pass `null` to restore the default.
 */
export function setAlertNotifier(next: AlertNotifier | null): void {
  notifier = next
}

/**
 * Emits an observability alert for a flagged/blocked agent run. Called by the
 * runtime after a run completes flagged, or when enforce mode blocks input.
 *
 * Deliberately keeps the raw input/output out of the alert (they may hold
 * secrets or the injection payload); apps needing the full trace can read the
 * `AgentRuns` collection via the access-control layer.
 */
export async function notifyFlaggedRun(payload: Payload, alert: FlaggedRunAlert): Promise<void> {
  if (notifier) {
    await notifier(alert)
    return
  }

  const { runId, agentId, blocked, reasons } = alert
  const message =
    `[AACMS] agent run #${runId} (agent ${agentId}) ` +
    `${blocked ? 'BLOCKED' : 'flagged'}: ${reasons.join(', ')}`
  if (blocked) payload.logger.error(message)
  else payload.logger.warn(message)
}
