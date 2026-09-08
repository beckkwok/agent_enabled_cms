import { NextRequest } from 'next/server'

export const SESSION_COOKIE = 'chat_session_id'

export function getSessionId(request: NextRequest): string | null {
  const cookie = request.headers.get('cookie') ?? ''
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]*)`))
  return match ? decodeURIComponent(match[1]) : null
}

export function sessionCookie(sessionId: string): string {
  return `${SESSION_COOKIE}=${encodeURIComponent(sessionId)}; Path=/; SameSite=Lax; Max-Age=${60 * 60 * 24 * 7}`
}
