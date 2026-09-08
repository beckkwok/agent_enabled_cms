import { postgresAdapter } from '@payloadcms/db-postgres'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import { mcpPlugin } from '@payloadcms/plugin-mcp'
import path from 'path'
import { buildConfig } from 'payload'
import { fileURLToPath } from 'url'
import sharp from 'sharp'

import { Users } from './collections/Users'
import { Roles } from './collections/Roles'
import { Providers } from './collections/Providers'
import { Agents } from './collections/Agents'
import { Media } from './collections/Media'
import { BlogPosts } from './collections/BlogPosts'
import { Knowledge } from './collections/Knowledge'
import { KnowledgeChunk } from './collections/KnowledgeChunk'
import { ChatSession } from './collections/ChatSession'
import { ChatMessage } from './collections/ChatMessage'
import { pgVectorSchemaHook } from './collections/helpers/pgvector'
import { ensureSearchTsvColumn } from './collections/helpers/searchTsv'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

export default buildConfig({
  admin: {
    user: Users.slug,
    importMap: {
      baseDir: path.resolve(dirname),
    },
  },
  collections: [Users, Media, BlogPosts, Knowledge, KnowledgeChunk, ChatSession, ChatMessage, Roles, Providers, Agents],
  editor: lexicalEditor(),
  secret: process.env.PAYLOAD_SECRET || '',
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
  db: postgresAdapter({
    pool: {
      connectionString: process.env.DATABASE_URL || '',
    },
    // Dev mode auto-pushes the schema. Migrations will be generated for the
    // new framework schema once the core collections are finalised.
    push: true,
    afterSchemaInit: [pgVectorSchemaHook],
    // Ensure the pgvector extension exists before schema push creates the
    // vector(1536) column on `knowledge_chunks` in a fresh database.
    extensions: ['vector'],
  }),
  onInit: async (payload) => {
    await ensureSearchTsvColumn(payload)
  },
  plugins: [
    mcpPlugin({
      collections: {
        'blog-posts': { enabled: { find: true } },
        media: { enabled: { find: true } },
        knowledge: { enabled: { find: true } },
        'chat-sessions': { enabled: { find: true } },
        'chat-messages': { enabled: { find: true, create: true } },
        roles: { enabled: { find: true } },
        providers: { enabled: { find: true } },
        agents: { enabled: { find: true } },
      },
    }),
  ],
  sharp,
})
