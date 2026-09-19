// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'

import { handoffMcpKey, setMcpKeyHandoff } from '@/lib/mcp-key-handoff'

afterEach(() => setMcpKeyHandoff(null))

describe('mcp-key-handoff', () => {
  it('prints the key once when no sink is installed (default)', async () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    await handoffMcpKey({ label: 'agent-default', key: 'aacms_secret', userId: 1 })
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('aacms_secret'))
    spy.mockRestore()
  })

  it('delegates to a custom sink (secret store)', async () => {
    const received: unknown[] = []
    setMcpKeyHandoff(async (info) => {
      received.push(info)
    })
    await handoffMcpKey({ label: 'agent-default', key: 'aacms_secret', userId: 2 })
    expect(received).toEqual([{ label: 'agent-default', key: 'aacms_secret', userId: 2 }])
  })

  it('restores the default when the sink is cleared', async () => {
    setMcpKeyHandoff(async () => {})
    setMcpKeyHandoff(null)
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    await handoffMcpKey({ label: 'x', key: 'aacms_secret', userId: 1 })
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })
})
