/**
 * Sentinel returned by API-key fields' `afterRead` instead of the decrypted
 * value, so the plaintext key never reaches the browser.
 *
 * It is a bullet mask (24 chars) so it also displays as a mask in Payload's
 * built-in API-key component and passes that field's length validation.
 *
 * - Reads that need the real key must pass `context: { revealApiKey: true }`
 *   (trusted server-side reads only).
 * - On save, if the submitted value equals this sentinel the stored value is
 *   preserved; an empty value clears it; anything else is treated as a new key.
 */
export const API_KEY_MASK = '••••••••••••••••••••••••'

export function isMaskedApiKey(value: unknown): boolean {
  return value === API_KEY_MASK
}
