import type { Provider } from '@/payload-types'

/**
 * Resolves the API key to use for a Provider record.
 *
 * Resolution order:
 *   1. `keyRef` — the named env/secret variable, if set and non-empty.
 *      This lets ops override a pasted key without touching the CMS.
 *   2. `apiKey` — the key pasted into the admin UI. When the Provider is read
 *      through Payload this value is already decrypted (see the field's
 *      `afterRead` hook); at rest it is AES-256-CTR encrypted.
 *
 * Returns `undefined` when neither source yields a key; callers should surface
 * a clear configuration error.
 */
export function resolveProviderApiKey(
  provider: Pick<Provider, 'keyRef' | 'apiKey'>,
): string | undefined {
  const envRef = provider.keyRef?.trim()
  if (envRef) {
    const fromEnv = process.env[envRef]
    if (fromEnv && fromEnv.trim()) return fromEnv
  }

  const pasted = provider.apiKey?.trim()
  if (pasted) return pasted

  return undefined
}

/** Throws a descriptive error when a Provider has no resolvable API key. */
export function requireProviderApiKey(
  provider: Pick<Provider, 'name' | 'keyRef' | 'apiKey'>,
): string {
  const key = resolveProviderApiKey(provider)
  if (!key) {
    throw new Error(
      `No API key configured for provider "${provider.name}". Set the "${provider.keyRef || '<keyRef>'}" env var or paste a key in the Provider record.`,
    )
  }
  return key
}
