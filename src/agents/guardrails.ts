/**
 * Lightweight agent safety guardrails.
 *
 * Two concerns:
 *   - `scanInput`  — heuristic prompt-injection / jailbreak detection.
 *   - `redactOutput` — strip secrets (and emails) from model output before it
 *     is returned or persisted.
 *
 * These are deliberately simple, deterministic heuristics — a first line of
 * defence, not a complete solution. See docs/v1-open-items.md #9.
 */

export type GuardrailResult = { flagged: boolean; reasons: string[] }
export type RedactResult = { text: string; redactions: string[] }

/** Thrown when guardrails block a run (enforce mode + flagged input). */
export class GuardrailError extends Error {
  reasons: string[]

  constructor(reasons: string[]) {
    super(`Input blocked by guardrails: ${reasons.join(', ')}`)
    this.name = 'GuardrailError'
    this.reasons = reasons
  }
}

type Pattern = { name: string; source: string; flags?: string }

const INJECTION_PATTERNS: Pattern[] = [
  { name: 'ignore-instructions', source: 'ignore\\s+(all\\s+)?(previous|prior|above)\\s+(instructions|prompts|rules)', flags: 'i' },
  { name: 'disregard-instructions', source: 'disregard\\s+(all\\s+)?(previous|prior|above)', flags: 'i' },
  { name: 'forget-instructions', source: 'forget\\s+(everything|your\\s+instructions|all\\s+previous)', flags: 'i' },
  { name: 'reveal-system-prompt', source: '(reveal|show|print|repeat|output|display)\\s+(me\\s+)?(your\\s+)?(system\\s+)?(prompt|instructions)', flags: 'i' },
  { name: 'repeat-above', source: 'repeat\\s+(everything|the\\s+text)\\s+above', flags: 'i' },
  { name: 'you-are-now', source: 'you\\s+are\\s+now\\s+', flags: 'i' },
  { name: 'developer-mode', source: 'developer\\s+mode', flags: 'i' },
  { name: 'jailbreak', source: '\\bjailbreak\\b', flags: 'i' },
  { name: 'dan', source: '\\bDAN\\b' },
  { name: 'act-unrestricted', source: 'act\\s+as\\s+(an?\\s+)?(unrestricted|unfiltered|unethical)', flags: 'i' },
  { name: 'override-safety', source: 'override\\s+(your\\s+)?(safety|guardrails|instructions)', flags: 'i' },
]

const SECRET_PATTERNS: Pattern[] = [
  { name: 'openai-key', source: 'sk-[A-Za-z0-9_-]{20,}' },
  { name: 'anthropic-key', source: 'sk-ant-[A-Za-z0-9_-]{20,}' },
  { name: 'aacms-mcp-key', source: 'aacms_[0-9a-f]{16,}' },
  { name: 'aws-access-key', source: 'AKIA[0-9A-Z]{16}' },
  { name: 'bearer-token', source: 'Bearer\\s+[A-Za-z0-9._-]{20,}', flags: 'i' },
  { name: 'generic-secret', source: '(api[_-]?key|secret|password|token)\\s*[:=]\\s*["\']?[A-Za-z0-9_\\-]{16,}', flags: 'i' },
]

const PII_PATTERNS: Pattern[] = [
  { name: 'email', source: '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}' },
]

function matches(pattern: Pattern, text: string): boolean {
  return new RegExp(pattern.source, pattern.flags ?? '').test(text)
}

/** Scans user input for prompt-injection / jailbreak patterns. */
export function scanInput(text: string): GuardrailResult {
  const reasons: string[] = []
  for (const pattern of INJECTION_PATTERNS) {
    if (matches(pattern, text)) reasons.push(`prompt-injection:${pattern.name}`)
  }
  return { flagged: reasons.length > 0, reasons }
}

/** Redacts secrets and PII (email) from model output. */
export function redactOutput(text: string): RedactResult {
  let out = text
  const redactions: string[] = []
  for (const pattern of [...SECRET_PATTERNS, ...PII_PATTERNS]) {
    const re = new RegExp(pattern.source, `${pattern.flags ?? ''}g`)
    if (re.test(out)) {
      redactions.push(pattern.name)
      out = out.replace(re, '[REDACTED]')
    }
  }
  return { text: out, redactions }
}

/** Convenience: redact a list of strings, returning combined redaction names. */
export function redactAll(texts: string[]): { texts: string[]; redactions: string[] } {
  const redactions = new Set<string>()
  const out = texts.map((t) => {
    const result = redactOutput(t)
    result.redactions.forEach((r) => redactions.add(r))
    return result.text
  })
  return { texts: out, redactions: [...redactions] }
}
