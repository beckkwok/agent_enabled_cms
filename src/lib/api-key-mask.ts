/**
 * Sentinel returned by the `Provider.apiKey` field's `afterRead` instead of the
 * decrypted value, so the plaintext key never reaches the browser.
 *
 * - Reads that need the real key must pass `context: { revealApiKey: true }`
 *   (trusted server-side reads only).
 * - On save, if the submitted value equals this sentinel the stored value is
 *   preserved; an empty value clears it; anything else is treated as a new key.
 */
export const API_KEY_MASK = '__AACMS_STORED_KEY__'

export function isMaskedApiKey(value: unknown): boolean {
  return value === API_KEY_MASK
}
