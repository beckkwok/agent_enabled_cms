import crypto from 'node:crypto'
import { describe, it, expect } from 'vitest'

import { Providers } from '@/collections/Providers'
import { API_KEY_MASK } from '@/lib/api-key-mask'

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

type Hook = (args: {
  value: unknown
  previousValue?: unknown
  operation?: string
  originalDoc?: unknown
  req: unknown
}) => unknown

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

const mockReq = { payload: { encrypt, decrypt }, context: {} }
const revealReq = { payload: { encrypt, decrypt }, context: { revealApiKey: true } }

describe('Providers.apiKey field', () => {
  it('encrypts on write and never stores plaintext', async () => {
    const field = getApiKeyField()
    const stored = (await field.hooks.beforeChange[0]({
      value: 'sk-secret-value',
      req: mockReq,
    })) as string
    expect(stored).not.toBe('sk-secret-value')
    expect(stored.length).toBeGreaterThan('sk-secret-value'.length)
  })

  it('masks the value on a normal read (no plaintext to the browser)', () => {
    const field = getApiKeyField()
    const stored = encrypt('sk-secret-value')
    expect(field.hooks.afterRead[0]({ value: stored, req: mockReq })).toBe(API_KEY_MASK)
  })

  it('reveals the value only for trusted reads (revealApiKey context)', () => {
    const field = getApiKeyField()
    const stored = encrypt('sk-secret-value')
    expect(field.hooks.afterRead[0]({ value: stored, req: revealReq })).toBe('sk-secret-value')
  })

  it('re-encrypts the stored key when the mask is submitted unchanged', async () => {
    const field = getApiKeyField()
    const req = {
      payload: {
        encrypt,
        decrypt,
        findByID: async () => ({ apiKey: 'sk-secret-value' }),
      },
      context: {},
    }
    const result = (await field.hooks.beforeChange[0]({
      value: API_KEY_MASK,
      operation: 'update',
      originalDoc: { id: 1 },
      req,
    })) as string
    expect(decrypt(result)).toBe('sk-secret-value')
  })

  it('clears when empty and encrypts a new value', async () => {
    const field = getApiKeyField()
    expect(await field.hooks.beforeChange[0]({ value: '', previousValue: 'x', req: mockReq })).toBe(
      '',
    )
    const stored = (await field.hooks.beforeChange[0]({ value: 'sk-new', req: mockReq })) as string
    expect(decrypt(stored)).toBe('sk-new')
  })

  it('passes empty / undefined reads through untouched', () => {
    const field = getApiKeyField()
    expect(field.hooks.afterRead[0]({ value: undefined, req: mockReq })).toBe(undefined)
    expect(field.hooks.afterRead[0]({ value: '', req: mockReq })).toBe('')
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
