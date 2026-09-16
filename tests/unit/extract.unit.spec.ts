// @vitest-environment node
import { describe, it, expect } from 'vitest'

import { extractText, stripHtml } from '@/lib/extract'

describe('stripHtml', () => {
  it('removes tags/scripts/styles and decodes basic entities', () => {
    const html = '<style>.a{color:red}</style><h1>Hi</h1><script>x()</script><p>A&nbsp;&amp; B</p>'
    expect(stripHtml(html)).toBe('Hi A & B')
  })
})

describe('extractText', () => {
  it('reads plain text files', async () => {
    const buffer = Buffer.from('Hello world', 'utf8')
    expect(await extractText({ buffer, filename: 'a.txt', mimeType: 'text/plain' })).toBe(
      'Hello world',
    )
  })

  it('reads markdown by extension', async () => {
    const buffer = Buffer.from('# Title\n\nbody', 'utf8')
    expect(await extractText({ buffer, filename: 'a.md' })).toBe('# Title\n\nbody')
  })

  it('strips HTML files', async () => {
    const buffer = Buffer.from('<p>Hello <b>world</b></p>', 'utf8')
    expect(await extractText({ buffer, filename: 'a.html', mimeType: 'text/html' })).toBe(
      'Hello world',
    )
  })

  it('throws a clear error for unsupported types', async () => {
    await expect(
      extractText({ buffer: Buffer.from('x'), filename: 'a.docx', mimeType: 'application/msword' }),
    ).rejects.toThrow(/Unsupported file type/)
  })
})
