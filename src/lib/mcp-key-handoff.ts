/**
 * MCP API-key provisioning handoff.
 *
 * The CMS is the *verifier* of MCP keys, never a key vault an agent queries:
 * the raw key is issued once and must reach the agent's secret store. The
 * default handoff prints the key once (manual copy — fine for a one-man
 * setup). Deployments with a secret store (Vault / SSM / K8s) register their
 * own sink via `setMcpKeyHandoff`, so a newly issued key is written there and
 * the agent reads it at boot. See docs/v1-open-items.md #4.
 */

export type McpKeyHandoff = {
  label: string
  key: string
  userId: number
}

export type McpKeyHandoffSink = (info: McpKeyHandoff) => void | Promise<void>

let sink: McpKeyHandoffSink | null = null

/** Installs a custom handoff sink (secret store, deploy injector, …). Pass `null` to restore the default. */
export function setMcpKeyHandoff(next: McpKeyHandoffSink | null): void {
  sink = next
}

/**
 * Hands a newly issued key off to the configured sink, or prints it once when
 * no sink is installed. Returns the key so callers can still read it in the
 * current process (e.g. for one-off deployment).
 */
export async function handoffMcpKey(info: McpKeyHandoff): Promise<void> {
  if (sink) {
    await sink(info)
    return
  }
  console.log(`\n=== SAVE THIS ONCE — MCP key "${info.label}" (user ${info.userId}) ===\n${info.key}\n`)
}
