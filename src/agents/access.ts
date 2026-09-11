import type { PayloadRequest } from 'payload'
import type { Agent } from '@/payload-types'

import { isAdmin } from '@/collections/helpers/access'

export type RunAccessMode = NonNullable<Agent['runAccess']>

export type RunAccessResult = { ok: true } | { ok: false; status: number; message: string }

/**
 * Enforces an Agent's configured `runAccess` for the run endpoint:
 *   - `public`        — anyone (e.g. a customer-facing FAQ agent)
 *   - `authenticated` — any logged-in principal (User/Admin/Agent) — default
 *   - `admin`         — Admin principals only (e.g. agents touching sensitive data)
 */
export function checkAgentRunAccess(
  agent: { runAccess?: Agent['runAccess'] | null },
  req: PayloadRequest,
): RunAccessResult {
  const mode: RunAccessMode = agent.runAccess ?? 'authenticated'

  if (mode === 'public') return { ok: true }

  if (!req.user) {
    return { ok: false, status: 401, message: 'Authentication required to run this agent.' }
  }

  if (mode === 'authenticated') return { ok: true }

  return isAdmin({ req })
    ? { ok: true }
    : { ok: false, status: 403, message: 'Admin access required to run this agent.' }
}
