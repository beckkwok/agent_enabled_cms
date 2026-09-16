import { readFile } from 'node:fs/promises'
import path from 'node:path'

export type ExtractInput = {
  buffer: Buffer
  filename?: null | string
  mimeType?: null | string
}

const TEXT_EXT = ['txt', 'md', 'markdown', 'csv', 'json', 'log', 'text']
const HTML_EXT = ['html', 'htm', 'xhtml']

function extOf(filename?: null | string): string {
  if (!filename) return ''
  const i = filename.lastIndexOf('.')
  return i >= 0 ? filename.slice(i + 1).toLowerCase() : ''
}

/** Very small HTML → text conversion (no DOM dependency). */
export function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Extracts plain text from a source file. Supported: plain text (txt/md/csv/
 * json/log), HTML, and PDF. Unknown types throw a clear error.
 */
export async function extractText({ buffer, filename, mimeType }: ExtractInput): Promise<string> {
  const ext = extOf(filename)
  const mime = mimeType ?? ''

  if (ext === 'pdf' || mime === 'application/pdf') {
    const { extractText: extractPdfText } = await import('unpdf')
    const { text } = await extractPdfText(new Uint8Array(buffer), { mergePages: true })
    return text
  }

  if (HTML_EXT.includes(ext) || mime.includes('text/html')) {
    return stripHtml(buffer.toString('utf8'))
  }

  if (TEXT_EXT.includes(ext) || mime.startsWith('text/')) {
    return buffer.toString('utf8').trim()
  }

  throw new Error(
    `Unsupported file type "${ext || mime || 'unknown'}". Supported: ${[...TEXT_EXT, ...HTML_EXT, 'pdf'].join(', ')}.`,
  )
}

/** Reads a Payload upload from local storage (staticDir defaults to the collection slug). */
export async function readMediaFile(filename: string, staticDir = 'media'): Promise<Buffer> {
  return readFile(path.join(process.cwd(), staticDir, filename))
}
