/**
 * Extracts plain text from a Payload Lexical rich-text document (recursively),
 * joining block children with newlines so paragraphs read sensibly.
 */
export function lexicalToPlainText(doc: unknown): string {
  if (!doc || typeof doc !== 'object') return ''
  const root = (doc as { root?: { children?: unknown[] } }).root
  if (!root?.children) return ''
  const parts: string[] = []
  const walk = (node: unknown) => {
    if (!node || typeof node !== 'object') return
    const n = node as { type?: string; text?: string; children?: unknown[] }
    if (typeof n.text === 'string' && n.text.length > 0) {
      parts.push(n.text)
    }
    if (Array.isArray(n.children)) {
      for (const child of n.children) walk(child)
    }
  }
  for (const child of root.children) walk(child)
  return parts.join(' ').replace(/\s+/g, ' ').trim()
}

/**
 * Builds a minimal Lexical rich-text document from a plain string, split into
 * paragraphs. Suitable for Payload's `richText` field with the lexical editor.
 */
export function plainTextToLexical(text: string) {
  const paragraphs = text.split('\n').filter((p) => p.trim().length > 0)
  const dir = 'ltr' as const
  const format = '' as const
  return {
    root: {
      type: 'root',
      format,
      indent: 0,
      version: 1,
      direction: dir,
      children: paragraphs.map((p) => ({
        type: 'paragraph',
        format,
        indent: 0,
        version: 1,
        direction: dir,
        children: [
          {
            type: 'text',
            mode: 'normal',
            format: 0,
            detail: 0,
            style: '',
            version: 1,
            text: p,
          },
        ],
      })),
    },
  }
}
