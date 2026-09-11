import { config as loadEnv } from 'dotenv'
loadEnv()

import { randomBytes } from 'node:crypto'
import { getPayload, type Payload } from 'payload'
import config from '../src/payload.config'
import { plainTextToLexical } from '../src/lib/lexical'

/**
 * Seeds the AACMS framework baseline and sample content.
 *
 * Framework bootstrap (idempotent):
 *   - default Roles
 *   - Provider records (openai / deepseek) referencing env keyRefs
 *   - an Admin user (SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD)
 *   - an Agent principal User (type Agent) + its Agent config row
 *   - MCP API keys: one per agent + one default/fallback key
 *     (raw keys printed ONCE at creation; stored only as HMAC apiKeyIndex)
 *
 * Sample content:
 *   - blog posts
 *   - private Knowledge (RAG sources)
 */

const MCP_KEY_COLLECTION = 'payload-mcp-api-keys'

// Per-collection capability toggles for MCP keys. Field groups mirror the
// @payloadcms/plugin-mcp config in src/payload.config.ts: a camelCased
// collection slug group holding find/create/update/delete checkboxes.
const ADMIN_KEY_CAPABILITIES = {
  blogPosts: { find: true },
  media: { find: true },
  knowledge: { find: true },
  chatSessions: { find: true },
  chatMessages: { find: true, create: true },
  roles: { find: true },
  providers: { find: true },
  agents: { find: true },
} as const

async function seedRoles(payload: Payload) {
  const defaults = [
    { name: 'admin', description: 'Administrator — full access to framework config.' },
    { name: 'user', description: 'Regular human user.' },
    { name: 'agent', description: 'Agent principal role — access control for agents.' },
  ]
  const seeded: string[] = []
  for (const role of defaults) {
    const exists = await payload.find({
      collection: 'roles',
      where: { name: { equals: role.name } },
      overrideAccess: true,
      depth: 0,
      limit: 1,
    })
    if (exists.totalDocs === 0) {
      await payload.create({ collection: 'roles', data: role, overrideAccess: true })
      seeded.push(role.name)
    }
  }
  if (seeded.length > 0) console.log('Seeded roles:', seeded.join(', '))
}

async function seedProviders(payload: Payload) {
  const providers: {
    name: string
    provider: 'openai' | 'deepseek' | 'anthropic' | 'local'
    models: { modelId: string }[]
    keyRef: string
    enabled: boolean
    baseUrl?: string
  }[] = [
    {
      name: 'openai',
      provider: 'openai',
      models: [{ modelId: 'text-embedding-3-small' }, { modelId: 'gpt-4o' }],
      keyRef: 'OPENAI_API_KEY',
      enabled: true,
    },
    {
      name: 'deepseek',
      provider: 'deepseek',
      models: [{ modelId: 'deepseek-chat' }, { modelId: 'deepseek-v4-pro' }],
      keyRef: 'DEEPSEEK_API_KEY',
      baseUrl: 'https://api.deepseek.com',
      enabled: true,
    },
  ]
  const seeded: string[] = []
  for (const provider of providers) {
    const exists = await payload.find({
      collection: 'providers',
      where: { name: { equals: provider.name } },
      overrideAccess: true,
      depth: 0,
      limit: 1,
    })
    if (exists.totalDocs === 0) {
      await payload.create({ collection: 'providers', data: provider, overrideAccess: true })
      seeded.push(provider.name)
    }
  }
  if (seeded.length > 0) console.log('Seeded providers:', seeded.join(', '))
}

async function getRoleId(payload: Payload, name: string): Promise<number | null> {
  const found = await payload.find({
    collection: 'roles',
    where: { name: { equals: name } },
    overrideAccess: true,
    depth: 0,
    limit: 1,
  })
  return found.totalDocs > 0 ? (found.docs[0].id as number) : null
}

async function seedUsersAndAgents(payload: Payload) {
  const adminEmail = process.env.SEED_ADMIN_EMAIL || 'admin@aacms.local'
  const adminPassword = process.env.SEED_ADMIN_PASSWORD || 'AacmsTest123!'
  const adminRoleId = await getRoleId(payload, 'admin')
  const agentRoleId = await getRoleId(payload, 'agent')
  const agentEmail = process.env.SEED_AGENT_EMAIL || 'agent-default@aacms.local'

  // --- Admin user ---
  const adminExists = await payload.find({
    collection: 'users',
    where: { email: { equals: adminEmail } },
    overrideAccess: true,
    depth: 0,
    limit: 1,
  })
  let adminUser = adminExists.docs[0]
  if (!adminUser) {
    adminUser = await payload.create({
      collection: 'users',
      data: {
        email: adminEmail,
        password: adminPassword,
        name: 'Admin',
        type: 'Admin',
        role: adminRoleId || undefined,
      },
      overrideAccess: true,
    })
    console.log('Created admin user:', adminEmail)
  }

  // --- Agent principal User + Agent config row ---
  const agentPrincipalExists = await payload.find({
    collection: 'users',
    where: { email: { equals: agentEmail } },
    overrideAccess: true,
    depth: 0,
    limit: 1,
  })
  let agentPrincipal = agentPrincipalExists.docs[0]
  if (!agentPrincipal) {
    agentPrincipal = await payload.create({
      collection: 'users',
      data: {
        email: agentEmail,
        // Agent principals authenticate via their MCP key, not password.
        password: randomBytes(24).toString('hex'),
        name: 'Default Agent Principal',
        type: 'Agent',
        role: agentRoleId || undefined,
      },
      overrideAccess: true,
    })
    console.log('Created agent principal user:', agentEmail)
  }

  const agentName = process.env.SEED_AGENT_NAME || 'Default Assistant'
  const provider = await payload.find({
    collection: 'providers',
    where: { name: { equals: 'deepseek' } },
    overrideAccess: true,
    depth: 0,
    limit: 1,
  })

  const agentExists = await payload.find({
    collection: 'agents',
    where: { name: { equals: agentName } },
    overrideAccess: true,
    depth: 0,
    limit: 1,
  })
  let agentConfig = agentExists.docs[0]
  if (!agentConfig) {
    agentConfig = await payload.create({
      collection: 'agents',
      data: {
        name: agentName,
        kind: 'single-shot',
        status: 'active',
        runAccess: 'authenticated',
        capabilities: ['knowledge'],
        user: agentPrincipal.id,
        provider: provider.totalDocs > 0 ? (provider.docs[0].id as number) : undefined,
        model: 'deepseek-chat',
        prompt: plainTextToLexical(
          'You are a helpful assistant for this site. Answer questions using the provided knowledge base context. ' +
            'If the answer is not in the context, say you are not sure. Be concise.',
        ),
      },
      overrideAccess: true,
    })
    console.log('Created agent config:', agentName)
  }

  return { adminUser: adminUser as { id: number }, agentPrincipal: agentPrincipal as { id: number } }
}

/**
 * Creates an MCP API key bound to a principal user, enabling the given
 * capability groups. Skips if a key with the same label already exists.
 *
 * Storage: Payload keeps the raw key in `api_key` **encrypted** with
 * PAYLOAD_SECRET (reversible, decrypt-on-read) plus `api_key_index` =
 * HMAC-SHA256(secret, key), which is what the MCP endpoint matches on.
 *
 * Handoff: the raw key is returned/printed ONCE. The agent does not read it
 * from the CMS — the operator must copy it into the agent's env/secret store
 * (the CMS is the verifier, not a key vault). A durable auto-provisioning
 * handoff is an open item; see docs/v1-open-items.md.
 */
async function seedMcpKey(
  payload: Payload,
  { label, userId, description, capabilities }: {
    label: string
    userId: number
    description: string
    capabilities: Record<string, { find?: boolean; create?: boolean; update?: boolean; delete?: boolean }>
  },
): Promise<string | null> {
  const exists = await payload.find({
    collection: MCP_KEY_COLLECTION,
    where: { label: { equals: label } },
    overrideAccess: true,
    depth: 0,
    limit: 1,
  })
  if (exists.totalDocs > 0) {
    console.log(
      `MCP key "${label}" already exists — skipping. Raw key is only emitted at creation; ` +
        `it can be re-read by its owning principal (api_key is stored encrypted), or by relaxing ` +
        `read access via overrideApiKeyCollection.`,
    )
    return null
  }

  const apiKey = `aacms_${randomBytes(24).toString('hex')}`
  const created = (await payload.create({
    collection: MCP_KEY_COLLECTION,
    data: {
      enableAPIKey: true,
      apiKey,
      label,
      description,
      user: userId,
      ...capabilities,
    },
    overrideAccess: true,
    depth: 0,
  })) as { id: number; apiKey?: string }

  // Payload stores the key encrypted and may normalise it; prefer whatever it
  // returns so the printed value is guaranteed to authenticate.
  const rawKey = created.apiKey || apiKey
  console.log(`Created MCP key "${label}" (id ${created.id})`)
  return rawKey
}

async function seedFramework(payload: Payload) {
  await seedRoles(payload)
  await seedProviders(payload)
  const { adminUser, agentPrincipal } = await seedUsersAndAgents(payload)

  const agentKey = await seedMcpKey(payload, {
    label: 'agent-default',
    userId: agentPrincipal.id,
    description: 'Per-agent MCP key for the Default Assistant agent (audit identity).',
    capabilities: ADMIN_KEY_CAPABILITIES,
  })
  const fallbackKey = await seedMcpKey(payload, {
    label: 'default',
    userId: adminUser.id,
    description: 'Default/fallback MCP key when no specific agent key applies.',
    capabilities: ADMIN_KEY_CAPABILITIES,
  })

  if (agentKey) console.log(`\n=== SAVE THIS ONCE — agent MCP key (${'agent-default'}) ===\n${agentKey}\n`)
  if (fallbackKey) console.log(`\n=== SAVE THIS ONCE — default/fallback MCP key ===\n${fallbackKey}\n`)
}

async function seedSampleContent(payload: Payload) {
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
    const data = { ...post, content: plainTextToLexical(post.content), _status: 'published' as const }
    if (exists.totalDocs === 0) {
      await payload.create({ collection: 'blog-posts', data, overrideAccess: true })
      console.log('Created blog post:', post.slug)
    } else {
      await payload.update({ collection: 'blog-posts', id: exists.docs[0].id, data, overrideAccess: true })
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
    const data = { ...k, _status: 'published' as const }
    if (exists.totalDocs === 0) {
      await payload.create({ collection: 'knowledge', data, overrideAccess: true })
      console.log('Created knowledge:', k.title)
    } else {
      // Re-seed refreshes content (and re-embeds via the afterChange hook).
      await payload.update({ collection: 'knowledge', id: exists.docs[0].id, data, overrideAccess: true })
      console.log('Updated knowledge:', k.title)
    }
  }
}

async function main() {
  const payload = await getPayload({ config })

  await seedFramework(payload)
  await seedSampleContent(payload)

  process.exit(0)
}
main().catch((err) => {
  console.error('FAILED:', err)
  process.exit(1)
})
