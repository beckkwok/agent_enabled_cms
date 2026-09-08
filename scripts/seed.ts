import { config as loadEnv } from 'dotenv'
loadEnv()

import { getPayload } from 'payload'
import config from '../src/payload.config'
import { plainTextToLexical } from '../src/lib/lexical'

/**
 * Seeds sample public content (blog posts) and private knowledge (RAG sources).
 * Reuse for both testing the RAG pipeline and populating the site. Idempotent:
 * existing docs are skipped/updated by slug/title.
 */
async function main() {
  const payload = await getPayload({ config })

  // --- Public: blog posts ---
  const now = new Date()
  const posts = [
    {
      title: 'Welcome to AACMS',
      slug: 'welcome-to-aacms',
      excerpt: 'An agent-enabled CMS built on Payload, Next.js, Postgres and LangChain.js.',
      content:
        'AACMS manages content, data, and agents together. This post introduces the framework: Payload CMS as the application tier, Postgres as the source of truth, and LangChain.js agents embedded in-process.',
      published: true,
      publishedDate: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString(),
      tags: [{ tag: 'AACMS' }, { tag: 'Payload CMS' }],
    },
    {
      title: 'Why hybrid search',
      slug: 'why-hybrid-search',
      excerpt: 'Combining keyword and semantic search with Reciprocal Rank Fusion.',
      content:
        'Hybrid search merges Postgres full-text search with pgvector cosine similarity via Reciprocal Rank Fusion, giving better recall on both exact terms and meaning.',
      published: true,
      publishedDate: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString(),
      tags: [{ tag: 'pgvector' }, { tag: 'AI' }, { tag: 'Databases' }],
    },
  ]

  for (const post of posts) {
    const exists = await payload.find({
      collection: 'blog-posts',
      where: { slug: { equals: post.slug } },
      overrideAccess: true,
      depth: 0,
    })
    if (exists.totalDocs === 0) {
      await payload.create({
        collection: 'blog-posts',
        data: { ...post, content: plainTextToLexical(post.content), _status: 'published' },
        overrideAccess: true,
      })
      console.log('Created blog post:', post.slug)
    } else {
      await payload.update({
        collection: 'blog-posts',
        id: exists.docs[0].id,
        data: { ...post, content: plainTextToLexical(post.content), _status: 'published' },
        overrideAccess: true,
      })
      console.log('Updated blog post:', post.slug)
    }
  }

  // --- Private: knowledge (RAG sources) ---
  const knowledgeDocs = [
    {
      title: 'AACMS — Framework Overview',
      content: [
        'AACMS is an agent-enabled content management system built on Payload CMS, Next.js, PostgreSQL and LangChain.js.',
        'The architecture has three layers: agents live in an embedded LangChain.js runtime, the application tier is Payload CMS (collections, access control, REST, MCP, queue), and PostgreSQL is the single source of truth.',
        'All reads and writes route through Payload CMS access control. Agents identify themselves by their own agent ID and never receive raw database access.',
      ].join('\n\n'),
    },
    {
      title: 'Retrieval — Hybrid Search',
      content: [
        'Vector search in AACMS is hybrid: Postgres full-text search and pgvector cosine similarity are fused with Reciprocal Rank Fusion.',
        'Documents are indexed for retrieval-augmented generation; chunks are embedded and stored in Postgres alongside the content they came from.',
      ].join('\n\n'),
    },
  ]

  for (const k of knowledgeDocs) {
    const exists = await payload.find({
      collection: 'knowledge',
      where: { title: { equals: k.title } },
      overrideAccess: true,
      depth: 0,
    })
    if (exists.totalDocs === 0) {
      await payload.create({
        collection: 'knowledge',
        data: { ...k, _status: 'published' },
        overrideAccess: true,
      })
      console.log('Created knowledge:', k.title)
    } else {
      // Re-seed refreshes content (and re-embeds via the afterChange hook).
      await payload.update({
        collection: 'knowledge',
        id: exists.docs[0].id,
        data: { ...k, _status: 'published' },
        overrideAccess: true,
      })
      console.log('Updated knowledge:', k.title)
    }
  }

  process.exit(0)
}
main().catch((err) => {
  console.error('FAILED:', err)
  process.exit(1)
})
