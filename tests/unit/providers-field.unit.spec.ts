import crypto from 'node:crypto'
import { describe, it, expect } from 'vitest'

import { Providers } from '@/collections/Providers'

/**
 * Payload's encrypt/decrypt (auth/crypto.js): AES-256-CTR with a random
 * 16-byte IV prepended to the ciphertext, key = sha256(secret).hex[:32].
 * Replicated here so the Provider field hooks can be tested without a DB.
 */
const SECRET = crypto.createHash('sha256').update('unit-test-secret').digest('hex').slice(0, 32)

function encrypt(text: string): string {
  const iv = crypto.randomBytes(16)
  const cipher = crypto.createCipheriv('aes-256-ctr', SECRET, iv)
  const encrypted = cipher.update(text, 'utf8', 'hex') + cipher.final('hex')
  return `${iv.toString('hex')}${encrypted}`
}

function decrypt(hash: string): string {
  const iv = hash.slice(0, 32)
  const content = hash.slice(32)
  const decipher = crypto.createDecipheriv('aes-256-ctr', SECRET, Buffer.from(iv, 'hex'))
  return decipher.update(content, 'hex', 'utf8') + decipher.final('utf8')
}

type Hook = (args: { value: unknown; req: unknown }) => unknown

function getApiKeyField() {
  const field = (Providers.fields as unknown as { name?: string }[]).find(
    (f) => f.name === 'apiKey',
  )
  if (!field) throw new Error('apiKey field not found on Providers collection')
  return field as unknown as {
    access: Record<string, (args: { req: { user?: unknown } }) => unknown>
    hooks: { beforeChange: Hook[]; afterRead: Hook[] }
  }
}

const mockReq = { payload: { encrypt, decrypt } }

describe('Providers.apiKey field', () => {
  it('encrypts on write and never stores plaintext', () => {
    const field = getApiKeyField()
    const stored = field.hooks.beforeChange[0]({ value: 'sk-secret-value', req: mockReq }) as string
    expect(stored).not.toBe('sk-secret-value')
    expect(stored.length).toBeGreaterThan('sk-secret-value'.length)
  })

  it('round-trips: encrypted value decrypts back to the original', () => {
    const field = getApiKeyField()
    const stored = field.hooks.beforeChange[0]({ value: 'sk-secret-value', req: mockReq }) as string
    const read = field.hooks.afterRead[0]({ value: stored, req: mockReq })
    expect(read).toBe('sk-secret-value')
  })

  it('passes empty / non-string values through untouched', () => {
    const field = getApiKeyField()
    expect(field.hooks.beforeChange[0]({ value: '', req: mockReq })).toBe('')
    expect(field.hooks.beforeChange[0]({ value: null, req: mockReq })).toBe(null)
    expect(field.hooks.afterRead[0]({ value: undefined, req: mockReq })).toBe(undefined)
  })

  it('restricts read/create/update to Admin principals', () => {
    const field = getApiKeyField()
    const admin = { req: { user: { collection: 'users', type: 'Admin' } } }
    const agent = { req: { user: { collection: 'users', type: 'Agent' } } }
    const anon = { req: { user: null } }

    expect(field.access.read(admin)).toBe(true)
    expect(field.access.create(admin)).toBe(true)
    expect(field.access.update(admin)).toBe(true)

    expect(field.access.read(agent)).toBe(false)
    expect(field.access.read(anon)).toBe(false)
  })
})
