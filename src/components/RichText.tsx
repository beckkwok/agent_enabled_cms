import Image from 'next/image'
import React from 'react'

import { cn } from '@/lib/utils'

type LexicalNode = {
  type?: string
  text?: string
  children?: LexicalNode[]
  format?: number
  tag?: string
  listType?: string
  url?: string
  linkType?: string
  fields?: {
    newTab?: boolean
    [key: string]: unknown
  }
  language?: string
  value?: unknown
  relationTo?: string
  [key: string]: unknown
}

const FORMAT_BOLD = 1
const FORMAT_ITALIC = 2
const FORMAT_STRIKETHROUGH = 8
const FORMAT_CODE = 16
const FORMAT_SUBSCRIPT = 32
const FORMAT_SUPERSCRIPT = 64
const FORMAT_UNDERLINE = 256

function renderText(node: LexicalNode): React.ReactNode {
  const text = node.text || ''
  const format = node.format || 0
  let content: React.ReactNode = text
  if (format & FORMAT_SUPERSCRIPT) content = <sup>{content}</sup>
  if (format & FORMAT_SUBSCRIPT) content = <sub>{content}</sub>
  if (format & FORMAT_CODE) content = <code>{content}</code>
  if (format & FORMAT_STRIKETHROUGH) content = <del>{content}</del>
  if (format & FORMAT_UNDERLINE) content = <u>{content}</u>
  if (format & FORMAT_ITALIC) content = <em>{content}</em>
  if (format & FORMAT_BOLD) content = <strong>{content}</strong>
  return content
}

type UploadValue = {
  url?: string
  alt?: string
  width?: number
  height?: number
  filename?: string
}

/** Renders a Lexical upload node (inline image / file upload) with next/image when possible. */
function renderUpload(node: LexicalNode, key: number): React.ReactNode {
  const value = node.value as UploadValue | null
  if (!value?.url) return null

  const img = {
    alt: value.alt || value.filename || '',
    width: value.width || 1200,
    height: value.height || 630,
  }

  return (
    <figure key={key} className="my-8">
      <Image
        src={value.url}
        alt={img.alt}
        width={img.width}
        height={img.height}
        className="mx-auto h-auto w-full rounded-lg"
        unoptimized={value.url.startsWith('/api/')}
      />
      {value.alt && <figcaption className="mt-2 text-center text-sm text-muted-foreground">{value.alt}</figcaption>}
    </figure>
  )
}

function renderTable(node: LexicalNode, key: number): React.ReactNode {
  const rows = (node.children || []).filter((c) => c.type === 'tablerow')
  return (
    <div key={key} className="my-6 overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <tbody>
          {rows.map((row, ri) => {
            const cells = (row.children || []).filter(
              (c) => c.type === 'tablecell' || c.type === 'tablecellcheck',
            )
            const isHeader = cells.some((c) => c.headerState === 1)
            const Tag = ri === 0 && isHeader ? 'th' : 'td'
            return (
              <tr key={ri}>
                {cells.map((cell, ci) => (
                  <Tag
                    key={ci}
                    className="border px-3 py-2 align-top"
                    colSpan={(cell.colSpan as number) || 1}
                    rowSpan={(cell.rowSpan as number) || 1}
                  >
                    {renderChildren(cell)}
                  </Tag>
                ))}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function renderChildren(node: LexicalNode): React.ReactNode {
  return (node.children || []).map((c, i) => renderNode(c, i))
}

function renderNode(node: LexicalNode, key: number): React.ReactNode {
  if (!node) return null

  // Text node
  if (node.type === 'text' || node.text !== undefined) {
    return <React.Fragment key={key}>{renderText(node)}</React.Fragment>
  }

  const children = renderChildren(node)

  switch (node.type) {
    case 'paragraph':
      return <p key={key}>{children}</p>
    case 'heading': {
      const tag = (node.tag || 'h2') as string
      return React.createElement(tag, { key }, children)
    }
    case 'list':
      return node.listType === 'number' ? (
        <ol key={key}>{children}</ol>
      ) : (
        <ul key={key}>{children}</ul>
      )
    case 'listitem':
      return <li key={key}>{children}</li>
    case 'quote':
      return <blockquote key={key}>{children}</blockquote>
    case 'linebreak':
      return <br key={key} />
    case 'horizontalrule':
      return <hr key={key} />
    case 'link': {
      const url = (node.url as string) || '#'
      const newTab = node.fields?.newTab || node.linkType !== 'internal'
      const isExternal = url.startsWith('http') || url.startsWith('//')
      return (
        <a
          key={key}
          href={url}
          rel={newTab ? 'noopener noreferrer' : undefined}
          target={newTab ? '_blank' : undefined}
          className={isExternal ? 'underline underline-offset-2' : undefined}
        >
          {children}
        </a>
      )
    }
    case 'upload':
      return renderUpload(node, key)
    case 'table':
      return renderTable(node, key)
    case 'tablerow':
    case 'tablecell':
    case 'tablecellcheck':
      return <React.Fragment key={key}>{children}</React.Fragment>
    case 'code':
      return (
        <pre key={key} className="overflow-x-auto rounded-lg bg-muted p-4 text-sm">
          <code>{children}</code>
        </pre>
      )
    case 'root':
    case 'section':
      return <React.Fragment key={key}>{children}</React.Fragment>
    default:
      return <React.Fragment key={key}>{children}</React.Fragment>
  }
}

/** Renders a Payload Lexical rich-text document as React nodes. */
export function RichText({ content, className }: { content: any; className?: string }) {
  if (!content?.root) return null
  const nodes = (content.root.children || []).map((c: any, i: number) => renderNode(c, i))
  return <div className={cn('rich-text', className)}>{nodes}</div>
}
