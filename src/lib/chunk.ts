/**
 * Unicode-safe text chunking.
 *
 * Slicing is done over grapheme clusters (via `Intl.Segmenter`) rather than
 * UTF-16 code units, so surrogate pairs (emoji, rare CJK extension chars) are
 * never split in half. Boundary snapping cuts on whitespace OR CJK punctuation
 * (。，；！？… etc.), which matters for languages that don't space-separate words.
 */
const BOUNDARY_RE = /[\s，。！？；：、,.!?;:…—]/

/** Splits a string into an array of grapheme clusters (user-perceived chars). */
function toGraphemes(text: string): string[] {
  const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
  const graphemes: string[] = []
  for (const { segment } of segmenter.segment(text)) {
    graphemes.push(segment)
  }
  return graphemes
}

/**
 * Splits text into overlapping chunks sized by grapheme count.
 *
 * Defaults of 800 chars with 200 chars of overlap work well with
 * text-embedding-3-small's 8191-token limit.
 */
export function chunkText(
  text: string,
  { chunkSize = 800, overlap = 200 }: { chunkSize?: number; overlap?: number } = {},
): string[] {
  const normalized = text.replace(/\r\n/g, '\n').replace(/\s+/g, ' ').trim()
  if (!normalized) return []

  const graphemes = toGraphemes(normalized)
  if (graphemes.length <= chunkSize) return [normalized]

  const chunks: string[] = []
  let start = 0
  const step = chunkSize - overlap

  while (start < graphemes.length) {
    let end = Math.min(start + chunkSize, graphemes.length)

    if (end < graphemes.length) {
      // Snap the cut to the last boundary (space or CJK punctuation) found at
      // least halfway into the chunk, so words are never split mid-way.
      for (let i = end - 1; i > start + chunkSize / 2; i--) {
        if (BOUNDARY_RE.test(graphemes[i])) {
          end = i + 1
          break
        }
      }
    }

    const chunk = graphemes.slice(start, end).join('').trim()
    if (chunk.length > 0) {
      chunks.push(chunk)
    }
    if (end >= graphemes.length) break

    start = end - overlap
  }

  return chunks
}
