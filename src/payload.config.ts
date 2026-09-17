import { postgresAdapter } from '@payloadcms/db-postgres'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import { mcpPlugin } from '@payloadcms/plugin-mcp'
import crypto from 'node:crypto'
import path from 'path'
import { buildConfig } from 'payload'
import { fileURLToPath } from 'url'
import sharp from 'sharp'

import { Users } from './collections/Users'
import { Roles } from './collections/Roles'
import { Providers } from './collections/Providers'
import { Agents } from './collections/Agents'
import { AgentRuns } from './collections/AgentRuns'
import { Guardrails } from './collections/Guardrails'
import { Media } from './collections/Media'
import { BlogPosts } from './collections/BlogPosts'
import { Knowledge } from './collections/Knowledge'
import { KnowledgeChunk } from './collections/KnowledgeChunk'
import { ChatSession } from './collections/ChatSession'
import { ChatMessage } from './collections/ChatMessage'
import { pgVectorSchemaHook } from './collections/helpers/pgvector'
import { ensureSearchTsvColumn } from './collections/helpers/searchTsv'
import { runAgentTask } from './jobs/runAgent'
import { reindexKnowledgeTask } from './jobs/reindexKnowledge'
import { SKILLS } from './agents/skills'
import { runSkill } from './agents/skills/authorize'
import { API_KEY_MASK } from './lib/api-key-mask'
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
  collections: [Users, Media, BlogPosts, Knowledge, KnowledgeChunk, ChatSession, ChatMessage, Roles, Providers, Agents, AgentRuns, Guardrails],
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
      {
        slug: 'reindexKnowledge',
        label: 'Reindex knowledge',
        inputSchema: [{ name: 'knowledgeId', type: 'number', required: true }],
        outputSchema: [
          { name: 'chunkCount', type: 'number' },
          { name: 'status', type: 'text' },
        ],
        handler: reindexKnowledgeTask,
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

    // Alert: embeddings (Knowledge ingestion + retrieval) need a key unless
    // mock embeddings are enabled. Surface it at boot, not only on first use.
    const mockEmbeddings = process.env.MOCK_EMBEDDINGS === '1'
    if (!mockEmbeddings && !process.env.OPENAI_API_KEY) {
      payload.logger.warn(
        '[AACMS] OPENAI_API_KEY is not set and MOCK_EMBEDDINGS is not "1" — ' +
          'Knowledge ingestion and retrieval embeddings will FAIL at runtime. ' +
          'Set OPENAI_API_KEY (or MOCK_EMBEDDINGS=1 for deterministic mock vectors).',
      )
    }
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
      // Expose framework skills as MCP custom tools. The handler receives the
      // API-key owner as req.user, so skill calls inherit their access rules.
      mcp: {
        tools: Object.values(SKILLS).map((skill) => ({
          name: skill.name,
          description: skill.description,
          parameters: skill.parameters,
          handler: async (args: Record<string, unknown>, req) => ({
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify(
                  await runSkill(skill, args, { payload: req.payload, user: req.user }),
                ),
              },
            ],
          }),
        })),
      },
      // Mask the MCP API key server-side so the plaintext never reaches the
      // browser (Payload's built-in API-key component keeps it in form state
      // otherwise). Trusted reads opt in with `context: { revealApiKey: true }`.
      overrideApiKeyCollection: (collection) => {
        collection.hooks = {
          ...collection.hooks,
          afterRead: [
            ...(collection.hooks?.afterRead ?? []),
            ({ doc, req }) => {
              const reveal = (req?.context as { revealApiKey?: boolean } | undefined)?.revealApiKey
              if (!reveal && doc && typeof doc.apiKey === 'string' && doc.apiKey.length > 0) {
                doc.apiKey = API_KEY_MASK
              }
              return doc
            },
          ],
          beforeChange: [
            ...(collection.hooks?.beforeChange ?? []),
            async ({ data, req, operation, originalDoc }) => {
              // The client submits the mask when the key is unchanged. Restore
              // the stored key (and its HMAC index) so the field doesn't get
              // overwritten with the mask.
              if (data?.apiKey === API_KEY_MASK) {
                const id = (originalDoc as { id?: number } | undefined)?.id
                if (id && operation === 'update') {
                  const existing = (await req.payload.findByID({
                    collection: 'payload-mcp-api-keys',
                    id,
                    depth: 0,
                    overrideAccess: true,
                    context: { revealApiKey: true },
                  })) as { apiKey?: null | string }
                  const raw = existing?.apiKey
                  if (raw) {
                    data.apiKey = raw
                    data.apiKeyIndex = crypto
                      .createHmac('sha256', req.payload.secret)
                      .update(raw)
                      .digest('hex')
                  }
                }
              }
              return data
            },
          ],
        }
        return collection
      },
    }),
  ],
  sharp,
})
