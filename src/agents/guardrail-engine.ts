import type { Payload } from 'payload'
import type { Provider } from '@/payload-types'

import { resolveProviderApiKey } from '@/lib/provider-key'
import {
  redactOutput as redactBuiltIn,
  redactSecrets,
  scanInput as scanBuiltIn,
  type RedactResult,
} from './guardrails'

export type InputScan = { flagged: boolean; blocked: boolean; reasons: string[] }
export type OutputRedaction = RedactResult
export type OutputPolicy = { flagged: boolean; blocked: boolean; reasons: string[] }

export type GuardrailEngine = {
  scanInput: (text: string) => InputScan
  redactOutput: (text: string) => OutputRedaction
  sanitizePrompt: (text: string) => OutputRedaction
  evaluateOutputPolicy: (text: string) => OutputPolicy
}

export type SafetyMode = 'off' | 'monitor' | 'enforce'

type CustomRule = {
  name: string
  direction?: null | string
  action?: null | string
  pattern: string
  flags?: null | string
  replacement?: null | string
}

const NOOP_ENGINE: GuardrailEngine = {
  scanInput: () => ({ flagged: false, blocked: false, reasons: [] }),
  redactOutput: (text) => ({ text, redactions: [] }),
  sanitizePrompt: (text) => ({ text, redactions: [] }),
  evaluateOutputPolicy: () => ({ flagged: false, blocked: false, reasons: [] }),
}

/** Builds a RegExp from a rule, or null when the pattern is invalid. */
function buildRegex(pattern: string, flags: string, global: boolean): RegExp | null {
  const normalized = global ? (flags.includes('g') ? flags : `${flags}g`) : flags.replace('g', '')
  try {
    return new RegExp(pattern, normalized)
  } catch {
    return null
  }
}

function testSafe(re: RegExp | null, text: string): boolean {
  if (!re) return false
  re.lastIndex = 0
  return re.test(text)
}

async function loadRules(payload: Payload, agentId?: number): Promise<CustomRule[]> {
  const result = await payload.find({
    collection: 'guardrails',
    where: {
      and: [
        { enabled: { equals: true } },
        {
          or: [{ agent: { exists: false } }, { agent: { equals: agentId } }],
        },
      ],
    },
    limit: 200,
    depth: 0,
    overrideAccess: true,
  })
  return result.docs as unknown as CustomRule[]
}

/** Collects the actual configured provider secrets so output can be matched exactly. */
async function loadConfiguredSecrets(payload: Payload): Promise<string[]> {
  const providers = await payload.find({
    collection: 'providers',
    where: { enabled: { equals: true } },
    limit: 100,
    depth: 0,
    overrideAccess: true,
    // Trusted server read: reveal plaintext keys so they can be redacted.
    context: { revealApiKey: true },
  })

  const secrets: string[] = []
  for (const provider of providers.docs) {
    try {
      const key = resolveProviderApiKey(provider as unknown as Provider)
      if (key && key.length >= 8) secrets.push(key)
    } catch {
      // ignore providers with no resolvable key
    }
  }
  return secrets
}

/**
 * Creates a guardrail engine bound to the CMS rules + configured secrets.
 *
 * - Built-in heuristics always apply (injection patterns, common secret
 *   prefixes, emails) unless safetyMode is `off`.
 * - Custom `Guardrails` collection rules are merged: input rules can flag/block,
 *   output rules can redact.
 * - Configured provider secrets are redacted by exact match (provider-agnostic).
 *
 * `safetyMode` gates enforcement: `monitor` records flags but never blocks;
 * `enforce` blocks when an input rule (built-in injection or a custom `block`
 * rule) matches.
 */
export async function createGuardrailEngine({
  payload,
  agentId,
  safetyMode,
}: {
  payload: Payload
  agentId?: number
  safetyMode: SafetyMode
}): Promise<GuardrailEngine> {
  if (safetyMode === 'off') return NOOP_ENGINE

  const [rules, secrets] = await Promise.all([
    loadRules(payload, agentId),
    loadConfiguredSecrets(payload),
  ])

  return {
    scanInput(text) {
      const builtIn = scanBuiltIn(text)
      const reasons = [...builtIn.reasons]
      // Built-in injection matches are block-worthy; custom rules set their own.
      let blocked = builtIn.flagged

      for (const rule of rules) {
        if (rule.direction === 'output') continue
        const re = buildRegex(rule.pattern, rule.flags ?? '', false)
        if (testSafe(re, text)) {
          reasons.push(`custom:${rule.name}`)
          if (rule.action === 'block') blocked = true
        }
      }

      return { flagged: reasons.length > 0, blocked, reasons }
    },

    redactOutput(text) {
      const builtIn = redactBuiltIn(text)
      let out = builtIn.text
      const redactions = [...builtIn.redactions]

      for (const rule of rules) {
        if (rule.direction === 'input') continue
        if (rule.action !== 'redact') continue
        const re = buildRegex(rule.pattern, rule.flags ?? '', true)
        if (re && re.test(out)) {
          redactions.push(`custom:${rule.name}`)
          out = out.replace(re, rule.replacement || '[REDACTED]')
        }
      }

      for (const secret of secrets) {
        if (out.includes(secret)) {
          out = out.split(secret).join('[REDACTED]')
          if (!redactions.includes('configured-secret')) redactions.push('configured-secret')
        }
      }

      return { text: out, redactions }
    },

    sanitizePrompt(text) {
      const builtIn = redactSecrets(text)
      let out = builtIn.text
      const redactions = [...builtIn.redactions]

      for (const secret of secrets) {
        if (out.includes(secret)) {
          out = out.split(secret).join('[REDACTED]')
          if (!redactions.includes('configured-secret')) redactions.push('configured-secret')
        }
      }

      return { text: out, redactions }
    },

    evaluateOutputPolicy(text) {
      const reasons: string[] = []
      let blocked = false

      for (const rule of rules) {
        if (rule.direction === 'input') continue
        if (rule.action !== 'block' && rule.action !== 'flag') continue
        const re = buildRegex(rule.pattern, rule.flags ?? '', false)
        if (testSafe(re, text)) {
          reasons.push(`policy:${rule.name}`)
          if (rule.action === 'block') blocked = true
        }
      }

      return { flagged: reasons.length > 0, blocked, reasons }
    },
  }
}
