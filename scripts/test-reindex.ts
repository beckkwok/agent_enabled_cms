import { config as loadEnv } from 'dotenv'
loadEnv()

import { sql } from '@payloadcms/db-postgres/drizzle'
import { getPayload } from 'payload'
import config from '../src/payload.config'
import { EMBEDDING_DIMENSIONS } from '../src/lib/embeddings'

async function main() {
  const payload = await getPayload({ config })

  // 1. Create a published knowledge doc
  const doc = await payload.create({
    collection: 'knowledge',
    data: {
      title: 'Test CV Entry',
      content:
        'I am a full-stack developer with 5 years of experience in TypeScript and React. ' +
        'I have built several production systems using Payload CMS and PostgreSQL. ' +
        'My expertise includes Next.js, Node.js, and vector databases for AI applications. ' +
        'I enjoy solving challenging engineering problems and mentoring junior developers.',
      _status: 'published',
    },
    overrideAccess: true,
  })

  console.log('Created knowledge doc:', doc.id)

  // 2. Verify chunks were created with embeddings
  const chunks = await payload.find({
    collection: 'knowledge-chunks',
    where: { knowledge: { equals: doc.id } },
    overrideAccess: true,
    depth: 0,
  })

  console.log(`Found ${chunks.totalDocs} chunks`)

  // 3. Read the embedding values + dimensions from the DB directly
  const result = await payload.db.execute({
    db: payload.db.drizzle,
    sql: sql`SELECT id, chunk_index, left(embedding::text, 60) AS embedding_preview, vector_dims(embedding) AS dims FROM knowledge_chunks WHERE knowledge_id = ${doc.id} ORDER BY chunk_index`,
  })
  const rows = Array.isArray(result) ? result : result.rows
  console.log('Embedding rows:', JSON.stringify(rows, null, 2))

  if (rows.length === 0) {
    throw new Error('No chunks stored — pipeline failed')
  }
  const dims = rows[0].dims
  console.log(`Vector dimensions: ${dims} (expected ${EMBEDDING_DIMENSIONS})`)

  // 4. Similarity search: embed a query vector and run a cosine search
  const queryVector = Array.from({ length: EMBEDDING_DIMENSIONS }, (_, i) => (i % 7) / 1000)
  const vecLit = `[${queryVector.join(',')}]`
  const sim = await payload.db.execute({
    db: payload.db.drizzle,
    sql: sql`SELECT id, chunk_index, content, 1 - (embedding <=> ${vecLit}::vector) AS similarity FROM knowledge_chunks WHERE knowledge_id = ${doc.id} ORDER BY embedding <=> ${vecLit}::vector LIMIT 5`,
  })
  const simRows = Array.isArray(sim) ? sim : sim.rows
  console.log('Similarity search results:', JSON.stringify(simRows, null, 2))

  // 5. Cleanup test doc (should cascade-delete chunks via the hook)
  await payload.delete({
    collection: 'knowledge',
    id: doc.id,
    overrideAccess: true,
  })
  const remaining = await payload.find({
    collection: 'knowledge-chunks',
    where: { knowledge: { equals: doc.id } },
    overrideAccess: true,
    depth: 0,
  })
  console.log(`After delete, remaining chunks: ${remaining.totalDocs}`)

  process.exit(0)
}

main().catch((err) => {
  console.error('FAILED:', err)
  process.exit(1)
})
