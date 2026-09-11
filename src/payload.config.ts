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
import { AgentRuns } from './collections/AgentRuns'
import { Media } from './collections/Media'
import { BlogPosts } from './collections/BlogPosts'
import { Knowledge } from './collections/Knowledge'
import { KnowledgeChunk } from './collections/KnowledgeChunk'
import { ChatSession } from './collections/ChatSession'
import { ChatMessage } from './collections/ChatMessage'
import { pgVectorSchemaHook } from './collections/helpers/pgvector'
import { ensureSearchTsvColumn } from './collections/helpers/searchTsv'
import { runAgentTask } from './jobs/runAgent'
import { migrations } from './migrations'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

export default buildConfig({
  admin: {
    user: Users.slug,
    importMap: {
      baseDir: path.resolve(dirname),
    },
  },
  collections: [Users, Media, BlogPosts, Knowledge, KnowledgeChunk, ChatSession, ChatMessage, Roles, Providers, Agents, AgentRuns],
  editor: lexicalEditor(),
  secret: process.env.PAYLOAD_SECRET || '',
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
  jobs: {
    tasks: [
      {
        slug: 'runAgent',
        label: 'Run agent',
        inputSchema: [
          { name: 'agentId', type: 'number', required: true },
          { name: 'input', type: 'textarea', required: true },
          { name: 'sessionId', type: 'text' },
          { name: 'runId', type: 'number' },
        ],
        outputSchema: [
          { name: 'runId', type: 'number' },
          { name: 'sessionId', type: 'text' },
          { name: 'output', type: 'textarea' },
        ],
        handler: runAgentTask,
      },
    ],
    // Process queued jobs in-process. Tune/replace with an external worker as needed.
    autoRun: [{ cron: '* * * * *', queue: 'default' }],
  },
  db: postgresAdapter({
    pool: {
      connectionString: process.env.DATABASE_URL || '',
    },
    // Push schema automatically in development only. In production Payload
    // uses the committed migrations (prodMigrations) — never prompt/push.
    push: process.env.NODE_ENV !== 'production',
    afterSchemaInit: [pgVectorSchemaHook],
    prodMigrations: migrations,
    // Ensure the pgvector extension exists before migrations create the
    // vector(1536) column on `knowledge_chunks` in a fresh production DB.
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
        providers: {
          enabled: { find: true },
          // Belt-and-braces: never expose the provider credential to models.
          // Field-level access already restricts `apiKey` to Admins, but strip
          // any residual occurrence from the model-facing response too.
          overrideResponse: (response) => {
            response.content = response.content.map((item) =>
              item.type === 'text'
                ? {
                    ...item,
                    text: item.text.replace(
                      /"apiKey"\s*:\s*"(?:[^"\\]|\\.)*"/g,
                      '"apiKey": "[redacted]"',
                    ),
                  }
                : item,
            )
            return response
          },
        },
        agents: { enabled: { find: true } },
      },
    }),
  ],
  sharp,
})
