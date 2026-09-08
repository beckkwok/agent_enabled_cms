import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'

import { getSessionId, sessionCookie } from '@/lib/session'
import { streamAnswer } from '@/lib/ask'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function generateSessionId(): string {
  return randomUUID()
}

/**
 * POST /api/ask
 * Ask the site assistant a question. The request is embedded, the hybrid
 * vector store is searched over the private Knowledge sources, and the
 * model answers strictly from the retrieved context — streamed token-by-token
 * via SSE.
 */
export async function POST(req: NextRequest) {
  let question: string
  try {
    const body = await req.json()
    question = typeof body?.question === 'string' ? body.question.trim() : ''
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  if (!question) {
    return NextResponse.json({ error: 'A non-empty "question" is required.' }, { status: 400 })
  }
  if (question.length > 2000) {
    return NextResponse.json({ error: 'Question is too long (max 2000 characters).' }, { status: 400 })
  }
  if (!process.env.DEEPSEEK_API_KEY) {
    return NextResponse.json({ error: 'Server is not configured with DEEPSEEK_API_KEY.' }, { status: 500 })
  }

  const sessionId = getSessionId(req) ?? generateSessionId()
  const isNewSession = !getSessionId(req)

  const headers = new Headers({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  })
  if (isNewSession) {
    headers.set('Set-Cookie', sessionCookie(sessionId))
  }

  try {
    const readable = await streamAnswer({ question, sessionId })
    return new Response(readable, { headers })
  } catch (err) {
    console.error('/api/ask error:', err)
    return NextResponse.json({ error: 'Failed to generate an answer. Please try again.' }, { status: 500 })
  }
}