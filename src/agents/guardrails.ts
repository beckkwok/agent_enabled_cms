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
    super(`Blocked by guardrails: ${reasons.join(', ')}`)
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

/** Shannon entropy in bits per character. Random-looking secrets score high. */
export function shannonEntropy(value: string): number {
  if (value.length === 0) return 0
  const freq: Record<string, number> = {}
  for (const ch of value) freq[ch] = (freq[ch] ?? 0) + 1
  let entropy = 0
  for (const ch in freq) {
    const p = freq[ch] / value.length
    entropy -= p * Math.log2(p)
  }
  return entropy
}

/** Candidate secret tokens: long runs of key-ish characters. */
export const SECRET_TOKEN_RE = /[A-Za-z0-9_\-+/=]{20,}/g

const ENTROPY_THRESHOLD = 3.5

/**
 * Looks like a hash/id rather than a secret: single-case hex (SHA/MD5, txids,
 * UUIDs) or base64 (padding `=` or the non-url-safe `+`/`/` chars). Real API
 * keys are mixed-case base62 and never carry those shapes, so this cuts the
 * common entropy false positives without weakening secret detection.
 */
export function isLikelyHashOrId(token: string): boolean {
  if (/^[0-9a-f]{20,}$/.test(token) || /^[0-9A-F]{20,}$/.test(token)) return true
  if (/[+/]/.test(token) || /={1,2}$/.test(token)) return true
  return false
}

/**
 * Heuristic: does this token look like an unlabelled secret? High entropy +
 * three character classes (upper + lower + digit), excluding hash/id shapes.
 * Catches unknown providers' keys (Grok/xAI, …) without a prefix pattern.
 *
 * Three classes (not two) drops single-case hex hashes/IDs; the shape check
 * drops base64. Tune `ENTROPY_THRESHOLD` if more tuning is needed.
 */
export function looksLikeSecret(token: string): boolean {
  if (token.length < 20) return false
  if (isLikelyHashOrId(token)) return false
  const classes = [/[A-Z]/, /[a-z]/, /[0-9]/].filter((re) => re.test(token)).length
  if (classes < 3) return false
  return shannonEntropy(token) >= ENTROPY_THRESHOLD
}

/** Scans user input for prompt-injection / jailbreak patterns. */
export function scanInput(text: string): GuardrailResult {
  const reasons: string[] = []
  for (const pattern of INJECTION_PATTERNS) {
    if (matches(pattern, text)) reasons.push(`prompt-injection:${pattern.name}`)
  }
  return { flagged: reasons.length > 0, reasons }
}

/**
 * Redacts secret-like tokens (not PII/emails) from a string. Used for the
 * outgoing prompt (defence-in-depth: a secret that leaked into context is
 * never shown to the model) and as the secret half of `redactOutput`.
 */
export function redactSecrets(text: string): RedactResult {
  let out = text
  const redactions: string[] = []

  for (const pattern of SECRET_PATTERNS) {
    const re = new RegExp(pattern.source, `${pattern.flags ?? ''}g`)
    if (re.test(out)) {
      redactions.push(pattern.name)
      out = out.replace(re, '[REDACTED]')
    }
  }

  // Entropy pass: catch unlabelled/unknown-provider secrets by randomness.
  out = out.replace(SECRET_TOKEN_RE, (token) => {
    if (!looksLikeSecret(token)) return token
    if (!redactions.includes('entropy')) redactions.push('entropy')
    return '[REDACTED]'
  })

  return { text: out, redactions }
}

/** Redacts secrets and PII (email) from model output. */
export function redactOutput(text: string): RedactResult {
  const secrets = redactSecrets(text)
  let out = secrets.text
  const redactions = [...secrets.redactions]

  for (const pattern of PII_PATTERNS) {
    const re = new RegExp(pattern.source, `${pattern.flags ?? ''}g`)
    if (re.test(out)) {
      redactions.push(pattern.name)
      out = out.replace(re, '[REDACTED]')
    }
  }

  return { text: out, redactions }
}
