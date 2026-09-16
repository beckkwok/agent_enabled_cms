// @vitest-environment node
import { describe, it, expect } from 'vitest'

import { collectStreamEvents, encodeSseEvent, type AgentStreamEvent } from '@/agents/stream'

function streamOf(events: AgentStreamEvent[]): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const event of events) controller.enqueue(encodeSseEvent(event))
      controller.close()
    },
  })
}

describe('SSE stream encoding', () => {
  it('encodes events as data: frames', () => {
    const frame = new TextDecoder().decode(encodeSseEvent({ type: 'token', content: 'hi' }))
    expect(frame).toBe('data: {"type":"token","content":"hi"}\n\n')
  })

  it('round-trips events through collectStreamEvents', async () => {
    const events: AgentStreamEvent[] = [
      { type: 'token', content: 'Hel' },
      { type: 'token', content: 'lo' },
      { type: 'done', runId: 1, sessionId: 's1', output: 'Hello' },
    ]
    expect(await collectStreamEvents(streamOf(events))).toEqual(events)
  })

  it('ignores malformed frames', async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('data: not-json\n\n'))
        controller.enqueue(encodeSseEvent({ type: 'token', content: 'ok' }))
        controller.close()
      },
    })
    expect(await collectStreamEvents(stream)).toEqual([{ type: 'token', content: 'ok' }])
  })
})
