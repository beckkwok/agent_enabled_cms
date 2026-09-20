# Build a restaurant app on AACMS

This tutorial walks you from a fresh clone to a working, agent-enabled website. We'll build a small **restaurant** example — a public site with a menu, and then a chatbot that can answer questions about that menu.

You only need to be comfortable with a terminal and basic JavaScript/TypeScript. No prior knowledge of AACMS, PayloadCMS, or LangChain is required — each step says *what* you're doing and *why*.

The tutorial is in three parts, so you can stop after any of them and still have something working:

- **Part I — the website.** Use AACMS like a normal CMS: define data, seed it, and build a front-end page.
- **Part II — the agent.** Add skills and an agent, and wire a chatbot into the page.
- **Part III — roles, safety, and evaluation.** Make the agent permission-aware, protect it, and measure how good it is.

---

## Prerequisites

- **Node.js** `>= 20.9` and **pnpm** (`^9` / `^10` / `^11`).
- **PostgreSQL** running — the repo ships a `docker-compose.yml`, or point `DATABASE_URL` at any Postgres 16+ with `pgvector`.

## Get it running

```bash
git clone <your-fork-or-copy>
cd agent_enabled_cms

cp .env.example .env      # fill in DATABASE_URL and PAYLOAD_SECRET
pnpm install
pnpm dev                  # http://localhost:3000
```

To run without paid API keys yet, add to `.env`:

```
MOCK_EMBEDDINGS=1   # fake vectors, no embedding key needed
MOCK_LLM=1          # agents use a fake chat model, no provider key needed
```

Seed the framework baseline (roles, providers, a sample agent, sample posts + knowledge):

```bash
npx tsx scripts/seed.ts
```

Now open http://localhost:3000/admin — that's the PayloadCMS admin panel. The first visit (or the seed) creates an admin user for you.

---

## How AACMS fits together

Before writing code, here's the shape of the thing in one picture:

```
 Agent / MCP client
        │  calls a skill (a small, permission-checked function)
        ▼
 PayloadCMS   (collections + access control + skills + API)
        │  reads/writes your data
        ▼
 PostgreSQL   (the single source of truth)
```

The direction that matters: **an agent never talks to the database directly.** It can only call *skills*, and every skill goes through Payload's access control on its way to the database. That is the whole security story in one sentence.

Two more ideas to hold onto:

- **Agents are data, not code.** You don't write an `Agent` class — you create a row in the `Agent` collection (its prompt, its tools, its model). Each agent is actually **two rows**: an `Agent` config ("what it is") plus a `User` principal of type `Agent` ("who it acts as" for permissions).
- **Skills are the operations.** A skill is a small function that reads or writes your data through Payload. The same skill is callable by an agent in a chat and by an external tool over MCP — one implementation, one access check.

### The collections you inherit (framework-owned)

The framework already defines a set of collections. **You are free to add, edit, and delete their *data* (rows)**, but you should **not change their *schema* (fields)** — those belong to the framework and are the "upgrade surface" you don't want to conflict with.

| Collection | What it holds |
| --- | --- |
| `User` | Login principals: human admins/users **and** agent principals. Has `type` (`User`/`Admin`/`Agent`) and a `role`. |
| `Role` | A named role and the **permissions** it grants (e.g. `content.write`, `runs.read`). |
| `Agent` | The agent config: prompt, model, which tools it may call, safety settings. |
| `Provider` | A model provider (OpenAI, DeepSeek, …) + how to reach it (`keyRef` → an env secret). |
| `Knowledge` | Documents agents can retrieve (RAG). Has `visibility`/`owner` for access. |
| `ChatSession` / `ChatMessage` | Conversation history, scoped to an agent. |
| `AgentMemory` | Long-term memory — facts that persist across conversations. |
| `AgentRuns` | A trace of every agent run (input, output, timing, errors). |
| `Guardrails` | Your own safety rules (regex filters on input/output). |
| `EvalCase` / `EvalRun` / `EvalResult` | Evaluation: known questions + expected answers, scored. |
| `Media` | Uploads (images, files). |
| `BlogPosts` | Sample content collection (the "blog"), kept as a reference. |

**Your application** then adds its *own* collections alongside these — for our restaurant, that's `Menu` (and later `Order`). Those are yours to define however you like.

### Skills already built in

To give you a feel for what an agent can do out of the box, the framework ships these skills (your agent just needs to have them listed in its `tools`):

| Skill | What it does |
| --- | --- |
| `searchKnowledge` | Search the Knowledge base (RAG) for relevant excerpts. |
| `listContent` | List published blog posts. |
| `getContent` | Get one published post by slug. |
| `countContent` | Count published posts. |
| `saveMemory` | Save a fact/preference to the agent's own long-term memory. |

You'll add your own skills (like `listMenu`) exactly the same way.

---

# Part I — the website

We'll build a normal CMS site first: define a menu, seed it, and render it on a page. At this stage there's no agent at all.

### Step 1 — define a collection

Create `src/collections/Menu.ts`:

```ts
import type { CollectionConfig } from 'payload'

export const Menu: CollectionConfig = {
  slug: 'menu-items', // becomes the table name and API route
  admin: {
    useAsTitle: 'name',
    group: 'Restaurant', // groups it in the admin sidebar
  },
  access: {
    read: () => true, // anyone can read the menu
  },
  fields: [
    { name: 'name', type: 'text', required: true },
    { name: 'price', type: 'number', required: true },
    { name: 'description', type: 'textarea' },
    { name: 'available', type: 'checkbox', defaultValue: true },
  ],
}
```

Then register it in `src/payload.config.ts` — add the import and add `Menu` to the `collections: [...]` array.

That single file gives you three things for free: a database table, a REST API (`/api/menu-items`), and an admin screen to add/edit rows. This is what "PayloadCMS" is: a typed schema becomes storage + API + UI.

### Step 2 — regenerate types

After any schema change, run:

```bash
pnpm generate:types
```

This refreshes `src/payload-types.ts` so your editor and skills know about `Menu`.

> **Migrations:** in development the schema is pushed automatically on boot. Before production you'll generate a committed migration with `pnpm payload migrate:create`. See `docs/building-applications.md`.

### Step 3 — build the front-end

The default front-end already exists under `src/app/(frontend)/` — a home page (`page.tsx`), a blog section (`blogs/`), and shared bits like the nav and footer (`src/components/Nav.tsx`). It's a Next.js app; you add pages the same way you would in any Next.js project.

Add a menu page at `src/app/(frontend)/menu/page.tsx`:

```tsx
import { getPayloadClient } from '@/lib/site-data'

export default async function MenuPage() {
  const payload = await getPayloadClient()
  const { docs } = await payload.find({
    collection: 'menu-items',
    where: { available: { equals: true } },
    sort: 'name',
    limit: 100,
  })

  return (
    <div>
      <h1>Menu</h1>
      <ul>
        {docs.map((item) => (
          <li key={item.id}>{item.name} — ${item.price}</li>
        ))}
      </ul>
    </div>
  )
}
```

Visit http://localhost:3000/menu. It'll be empty until we add data.

> The front-end is ordinary Next.js, so you can style it however you like and pull in standard Payload plugins (SEO, search, etc.) the normal way — the framework doesn't restrict your pages.

### Step 4 — seed some data

Add a few items in `scripts/seed.ts` (or just type them into the admin UI):

```ts
await payload.create({
  collection: 'menu-items',
  data: { name: 'Margherita Pizza', price: 12.5, description: 'Classic.' },
  overrideAccess: true,
})
await payload.create({
  collection: 'menu-items',
  data: { name: 'Garlic Bread', price: 5, description: 'Sides.' },
  overrideAccess: true,
})
```

Run `npx tsx scripts/seed.ts`, refresh `/menu`, and you have a working website. **Part I is done** — this is just a normal CMS at this point.

---

# Part II — the agent

Now we make it smart: a chatbot that answers questions about the menu. This is where AACMS stops being a plain CMS.

### Step 5 — write a skill

A skill is the operation the agent is allowed to perform. Create `src/agents/skills/listMenu.ts`:

```ts
import { z } from 'zod'
import type { Skill } from './types'

export const listMenu: Skill = {
  name: 'listMenu',
  description: 'List available menu items with their name and price.',
  parameters: {
    limit: z.number().optional().describe('Maximum number of items (default 20).'),
  },
  handler: async (args, ctx) => {
    const limit = Math.min(Math.max(Number(args.limit ?? 20) || 20, 1), 100)
    const result = await ctx.payload.find({
      collection: 'menu-items',
      where: { available: { equals: true } },
      sort: 'name',
      limit,
      depth: 0,
      overrideAccess: false, // keep this false — permissions still apply
      user: ctx.user,        // act as whoever is calling
    })
    return { items: result.docs }
  },
}
```

The two lines that matter are `overrideAccess: false` and `user: ctx.user`: the skill asks Payload to read the menu *as the caller*, so the collection's access rules still decide what's allowed. A skill is a door, never a back door.

### Step 6 — register the skill

Open `src/agents/skills/index.ts` and add it to the `SKILLS` map:

```ts
import { listMenu } from './listMenu'

export const SKILLS: Record<string, Skill> = {
  // ...existing skills...
  [listMenu.name]: listMenu,
}
```

That one line exposes `listMenu` as both an **agent tool** and an **MCP tool**.

### Step 7 — create an agent

Remember: an agent is data. Add this to your seed (or use the admin):

```ts
import { plainTextToLexical } from '../src/lib/lexical'

// 1) the security principal (a User of type "Agent")
const principal = await payload.create({
  collection: 'users',
  data: {
    email: 'menu-agent@myapp.local',
    password: 'a-random-password', // agents authenticate via their MCP key, not this
    name: 'Menu Agent',
    type: 'Agent',
  },
  overrideAccess: true,
})

// 2) the agent config
const agent = await payload.create({
  collection: 'agents',
  data: {
    name: 'Menu Assistant',
    kind: 'single-shot',
    status: 'active',
    runAccess: 'authenticated',
    capabilities: [],
    tools: ['listMenu'],           // the skill it may call
    user: principal.id,
    prompt: plainTextToLexical('You help customers browse the menu. Be concise.'),
  },
  overrideAccess: true,
})
```

### Step 8 — wire it into the page

Add a small chat component to the menu page. The agent's **stream** endpoint returns server-sent events (`token`, then `done`/`error`), which is exactly what a chat UI needs:

```tsx
'use client'
import { useState } from 'react'

export function MenuChat({ agentId }: { agentId: number }) {
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState('')

  async function ask() {
    setAnswer('')
    const res = await fetch(`/api/agents/${agentId}/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: question }),
    })
    const reader = res.body!.getReader()
    const decoder = new TextDecoder()
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      for (const line of decoder.decode(value, { stream: true }).split('\n')) {
        if (line.startsWith('data: ')) {
          const event = JSON.parse(line.slice(6))
          if (event.type === 'token') setAnswer((a) => a + event.content)
        }
      }
    }
  }

  return (
    <div>
      <div>{answer}</div>
      <input value={question} onChange={(e) => setQuestion(e.target.value)} />
      <button onClick={ask}>Ask</button>
    </div>
  )
}
```

(This is a deliberately minimal example — the framework's `streamAgentRun` owns the streaming; the UI is yours.)

### Step 9 — talk to it

Restart `pnpm dev`, ask "What is on the menu?", and the agent calls `listMenu`, reads the menu through access control, and answers. Every run is recorded in the **Agent Runs** admin section — input, output, tool calls, timing — your audit trail.

**Part II is done.** You now have a basic agent-enabled CMS.

### It doesn't stop at chatbots

The same pattern (skills + an agent) powers much more than chat. A few directions to take it later:

- **Support agent** — answers from your `Knowledge` base (`searchKnowledge`).
- **Internal analysis / reporting** — a skill that reads orders and computes totals, an agent that summarizes.
- **Content operator** — a skill that creates/updates posts, an agent that drafts them.
- **Multi-agent** (roadmap) — a supervisor agent delegating to worker agents.

---

# Part III — roles, safety, and evaluation

## Roles & permissions

So far the agent only *reads* a public menu. Real apps need writes, and writes need permission.

The model is simple and it's the same for humans and agents:

- A **Role** has a list of **permissions** (keys like `orders.write`).
- A **User** (including an agent principal) has a **role**.
- A collection's `access` asks: does this caller's role grant the needed permission?

Because skills call Payload with `overrideAccess: false` + `user`, the agent is **automatically bounded** by whatever role its principal has. The skill never decides "am I allowed?" — the collection's access rules do.

**a) Define a permission.** In `src/collections/helpers/access.ts`, extend `PERMISSIONS`:

```ts
export const PERMISSIONS = ['content.write', 'runs.read', 'orders.write'] as const
```

(`Roles.permissions` is built from this list, so the new key appears in the admin automatically.)

**b) Gate a collection.** On your `Order` collection:

```ts
import { requirePermission } from './helpers/access'
// ...
access: {
  create: requirePermission('orders.write'),
  update: requirePermission('orders.write'),
  delete: requirePermission('orders.write'),
}
```

**c) Give a role the permission, and give the agent that role.** In the admin **Roles** screen, create a role (say `cashier`) with `orders.write`, then set the agent's `User` principal `role` to `cashier`. Only admins can change a user's `role`/`type` (the framework locks that down), so this is an admin action.

Now an agent whose principal has the `cashier` role can create orders; one that doesn't, can't — same as a human. That's the whole role story.

## Safety: pre- and post-filters

Agents can be tricked (prompt injection, trying to leak secrets). AACMS ships **built-in pre- and post-filters** so you don't start from zero:

- **Pre-filter (input):** detects prompt-injection/jailbreak patterns and scans for secrets before the model sees them.
- **Post-filter (output):** redacts secrets/PII, applies your content-policy rules, and can block off-policy output.

These are controlled per-agent by `safetyMode`:

| Mode | Behaviour |
| --- | --- |
| `off` | No filtering. |
| `monitor` (default) | Detect + redact, and flag the run — but don't block. |
| `enforce` | Block matching input/output; redact everything else. |

There are also sensible **default rules** installed (credit-card, US SSN, IBAN are redacted), plus an optional `semanticSafety` flag for a model-based injection check.

**Want to add your own filter?** Add a row in the **Guardrails** collection: a regex pattern, a `direction` (`input`/`output`/`both`), and an `action` (`flag` / `block` / `redact`). Example: detect your own order-number format and redact it. No code required.

## Evaluation: is the agent any good?

An agent that "seems fine" can regress. The framework can score it for you:

- **`EvalCase`** — a known question with an expected answer/behaviour (e.g. "What is on the menu?" should mention *Margherita*).
- **`EvalRun`** — run the agent against a set of cases; it produces `EvalResult`s with a pass/fail and a score.
- Scorers can be **exact/contains**, **tool-use** (did it call `listMenu`?), **safety** (should it have been flagged?), or a **semantic judge** (an LLM grades meaning).
- **Gate** — set `passThreshold` and turn on `gateEnforced` on the agent; if an eval falls below the bar, the agent is deactivated automatically.

To evaluate your menu agent: create a few `EvalCase`s for it, create an `EvalRun`, and check the pass rate in the admin.

---

## Testing

Test your app in two layers:

1. **As a normal app.** Unit tests for pure logic (chunking, access rules, your skill's argument validation) and integration tests for collections/skills against a test database — see `docs/development.md` for layout.
2. **As an agent.** Evaluation cases (above) prove *quality*; an e2e test proves the *path* — agent identity → allowed tool call → denied call → rejection with no key. See `tests/e2e/`.

```bash
pnpm test:unit
pnpm test:int    # needs a Postgres test DB
```

---

## Where to go next

- `docs/building-applications.md` — the full app-developer contract (what to add, what not to touch, skills authoring, guardrails, migration guidance).
- `docs/agents.md` — the agent runtime in detail (run/stream, safety, memory, evaluation).
- `docs/provider-model.md` — wiring real model providers.
- `docs/mcp-connectivity.md` — exposing your skills to external tools over MCP.

---

## The golden rule (one last reminder)

> **Add, don't edit.** New collections, skills, and agents live *alongside* the framework. You may freely insert/update/delete the **data** in framework collections, but don't change their **schema** or the framework's code. If a future framework upgrade would conflict with your change, that change belongs in your application, not in the framework.
