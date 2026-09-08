'use client'

import { Bot, MessageSquare, Send, X } from 'lucide-react'
import * as React from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'

type Message = { role: 'user' | 'assistant'; content: string }

export function ChatWidget() {
  const [open, setOpen] = React.useState(false)
  const [messages, setMessages] = React.useState<Message[]>([])
  const [input, setInput] = React.useState('')
  const [loading, setLoading] = React.useState(false)
  const [content, setContent] = React.useState('')
  const listRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, content])

  async function handleSend(e: React.FormEvent) {
    e.preventDefault()
    const question = input.trim()
    if (!question || loading) return

    setMessages(prev => [...prev, { role: 'user', content: question }])
    setInput('')
    setLoading(true)
    setContent('')

    try {
      const res = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question }),
      })
      const reader = res.body?.getReader()
      if (!reader) throw new Error('No stream')
      const decoder = new TextDecoder()
      let buffer = ''
      let fullContent = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''
        for (const line of lines) {
          if (line.trim()) {
            try {
              const parsed = JSON.parse(line)
              if (parsed.content) {
                fullContent += parsed.content
                setContent(fullContent)
              }
            } catch { /* ignore malformed line */ }
          }
        }
      }
      if (buffer.trim()) {
        try {
          const parsed = JSON.parse(buffer)
          if (parsed.content) {
            fullContent += parsed.content
            setContent(fullContent)
          }
        } catch { /* ignore */ }
      }

      setMessages(prev => {
        const next = [...prev]
        const last = next[next.length - 1]
        if (last?.role === 'assistant') {
          next[next.length - 1] = { role: 'assistant', content: fullContent }
        } else {
          next.push({ role: 'assistant', content: fullContent })
        }
        return next
      })
      setContent('')
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Network error. Try again.' }])
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      {open && (
        <div className="fixed right-4 bottom-4 z-50 flex h-[480px] max-h-[calc(100dvh-8rem)] w-[360px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-xl border bg-background shadow-xl sm:right-6 sm:bottom-6">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
                <Bot className="size-4" />
              </span>
              <div>
                <p className="text-sm font-medium leading-tight">Site assistant</p>
                <p className="text-xs text-muted-foreground">Ask me anything</p>
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={() => setOpen(false)} aria-label="Close chat">
              <X className="size-4" />
            </Button>
          </div>

          <ScrollArea className="flex-1">
            <div ref={listRef} className="flex flex-col gap-3 p-4">
              {messages.length === 0 && !loading && (
                <p className="text-sm text-muted-foreground">
                  Ask about the knowledge base — I&apos;ll answer from the available sources.
                </p>
              )}
              {messages.map((m, i) => (
                <div
                  key={i}
                  className={cn(
                    'max-w-[85%] rounded-xl px-3.5 py-2 text-sm whitespace-pre-wrap',
                    m.role === 'user'
                      ? 'self-end bg-primary text-primary-foreground'
                      : 'self-start border bg-muted/50',
                  )}
                >
                  {m.content}
                </div>
              ))}
              {loading && (
                <div className="self-start rounded-xl border bg-muted/50 px-3.5 py-2 text-sm whitespace-pre-wrap text-muted-foreground">
                  {content || 'Typing\u2026'}
                </div>
              )}
            </div>
          </ScrollArea>

          <form onSubmit={handleSend} className="flex items-center gap-2 border-t p-3">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type your question\u2026"
              aria-label="Question"
            />
            <Button type="submit" size="icon" disabled={loading || !input.trim()} aria-label="Send">
              <Send className="size-4" />
            </Button>
          </form>
        </div>
      )}
      <Button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Toggle chat"
        className="fixed right-4 bottom-4 z-50 size-14 rounded-full shadow-lg sm:right-6 sm:bottom-6"
      >
        {open ? <X className="size-6" /> : <MessageSquare className="size-6" />}
      </Button>
    </>
  )
}