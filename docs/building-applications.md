# Building an application on AACMS

Guide for developers extending this framework to build an agent-enabled application (e.g. a food-delivery product with menu/order/quotation). Read this and `AGENTS.md` before starting.

## Before you start: understand the contract

- AACMS is a **framework**. It provides content + data management, agents, access control, retrieval, and queueing. Your application provides the *company-specific* tables (menu, order, customer) and the business agents that operate on them.
- Data flow is fixed: `Agent / Front-end → PayloadCMS API (incl. MCP) → PostgreSQL`. Agents never own the source of truth.
- Everything about an agent — prompts, roles, provider/model, tools, keys — is **data in PayloadCMS**, never code. If you find yourself hardcoding an agent, stop.
- The `User`/`Role` access layer is the trust boundary for both humans and agents. Design your tables' access rules explicitly and least-privilege.

## Adding to the framework: prefer adding, not editing

Add new collections, globals, tools, prompts, agents, and queue jobs **alongside** the framework. Do not modify framework code unless you own that change for all consumers.

### Do add (application layer)

- Company-specific collections (e.g. `Menu`, `Order`, `Quotation`) in the **CMS / application group**, each with explicit `access` rules keyed to `User`/`Admin`/`Agent` roles.
- New `Agent` documents (data rows) for your business flows — single-shot or streaming.
- Custom **skills** that implement your business operations (write transaction, read, calculation/reporting) — authored as `Skill`s and registered in the skill registry, which exposes them as both agent tools and MCP custom tools. See "Writing skills" below.
- Queue jobs that trigger your agents and write status/results back through collections.
- Web views / front-end routes that display your data; register them in PayloadCMS.
- e2e tests for your agent ↔ CMS paths.

### Do not touch (framework-owned) — protect upgradeability

- **Core schema groups** — `Page`, `Post`, `Media` (CMS); `Agent`, `Chat session`, `Chat history` (Agent); `User`, `Role`, `Document`, `Provider` (Framework). These are the upgrade surface; changing them breaks future framework migrations.
- **Access-control architecture** — the role/user model and the rule that all reads/writes route through PayloadCMS.
- **Embedded LangChain.js agent runtime**, the hybrid RRF retrieval (`hybridSearch`/`searchMemory`), and the MCP plugin wiring in `payload.config.ts`.
- **Shared hooks/migrations** in framework paths. If you must extend behavior, extend by composition (new fields on *your* tables, hooks on *your* collections), not by editing shared framework files.

> Rule of thumb: if a framework upgrade (`git pull` / new framework release) would conflict with your edit, it belongs in the application layer, not a framework file.

## Collection lifecycle: schema is code + migrations, not runtime

Payload collections are **static and code-defined** — there is no runtime/admin-UI schema builder (unlike Strapi). The schema is fixed at server boot from the Payload config. This constrains how app collections are added:

- **Add at boot in your code, not at run time.** App collections are authored as TypeScript `CollectionConfig`s in your own codebase and passed to the Payload config (`buildConfig`). There is no API or admin action that registers a collection after startup.
- **Compose, don't fork.** Import the framework config/collections and extend: e.g. `collections: [...frameworkCollections, Menu, Order, Quotation]`. Boot-time composition is supported; schema mutation at run time is not.
- **Every schema change is a code + migration step.** After adding/altering a collection, run `payload generate:types` (regenerate TS types) and create a DB migration (see the `blog` repo pattern: `src/migrations/*`, drizzle `afterSchemaInit` hooks for extensions like the pgvector column). Apps inherit this discipline — new app collections ship with their own migrations.
- **Consequence for "no-code" expectations:** an end user cannot add tables from the admin UI. If an app needs per-tenant custom fields at run time, model them as flexible data within a framework-owned collection (e.g. a JSON/block field), not as new tables.

## Writing skills (agent tools / MCP tools)

**Skills are how your application exposes operations to agents.** A skill is a small, single-purpose function that reads or writes your collections through Payload — and the framework turns it into *both* an agent tool (callable during a run) and an MCP custom tool (callable by external MCP clients). You write it once; access control is identical in both paths.

### 1. Define a skill

Create a file under your app's skills folder (framework skills live in `src/agents/skills/`):

```ts
import { z } from 'zod'
import type { Skill } from '@/agents/skills/types'

export const createQuotation: Skill = {
  name: 'createQuotation',              // also the MCP tool name + Agent.tools value
  description: 'Create a quotation for a customer with line items.', // model-facing: be precise
  parameters: {
    customerId: z.number().describe('The customer id.'),
    items: z.array(z.object({ sku: z.string(), qty: z.number() })).describe('Line items.'),
  },
  handler: async (args, ctx) => {
    // ctx.payload = Payload instance, ctx.user = the acting principal
    const quotation = await ctx.payload.create({
      collection: 'quotations',
      data: { customer: args.customerId, items: args.items, status: 'draft' },
      overrideAccess: false,   // MUST stay false — access rules must apply
      user: ctx.user,          // acts as the agent principal / MCP key owner
    })
    return { id: quotation.id, total: quotation.total }
  },
}
```

### 2. Register it

Add it to the `SKILLS` registry (`src/agents/skills/index.ts`):

```ts
export const SKILLS = {
  ...,
  [createQuotation.name]: createQuotation,
}
```

Registering is all that's needed — the framework then:
- lists it in the `Agent.tools` selector (admin → Agents),
- registers it as an MCP custom tool (per-key toggles in **MCP → API Keys**),
- makes it callable by the model in the agent run tool loop.

### 3. Rules (non-negotiable)

- **Always `overrideAccess: false` + `user: ctx.user`.** Never bypass access control. The skill runs as the acting principal, so your collection `access` rules gate it.
- **Single-purpose, small handlers.** One operation per skill; return JSON-serializable data.
- **No secrets, no over-sharing.** Never return data the caller cannot read; never include provider keys or PII.
- **Write a strong `description`** — it's the model's primary signal for choosing the tool.
- **Validate/limit inputs** (bounds on `limit`, etc.).
- **Do not use `overrideAccess: true`** except in genuinely system-generated writes.
- **Optionally gate invocation**: set `requiredUserTypes: ['Admin']` or `requiredRoles: ['finance']` on the skill to restrict who may call it (Admins always pass). Enforced by `authorizeSkill` before the handler runs, in both the agent runtime and MCP. See `docs/agents.md`.

### 4. Enabling a skill for an agent

Skills are opt-in per agent via the `Agent.tools` field, and per MCP key via the key's tool toggles. An agent can only call skills it has selected; an MCP client only the ones its key allows.

### 5. Schema/migration note (important)

Skills are stored as a Postgres **enum** (`enum_agents_tools`) and as MCP key toggle columns. **Adding or removing a skill changes the schema**, so after editing the registry run:

```bash
payload generate:types
payload migrate:create
```

and commit the migration. Removing a skill that an `Agent` still references will drop it from that agent.

### 6. Test it

- **Unit**: call `skill.handler(args, { payload, user })` and assert it passes `overrideAccess: false` + `user` (see `tests/unit/skills.unit.spec.ts`).
- **Integration**: run an agent with the skill via a scripted model (`tests/int/agent-tools.int.spec.ts`) and assert the `AgentRun` + result.

## Role → permissions (data access)

Collection `access` is role-aware via `requirePermission` (`src/collections/helpers/access.ts`). Admins always pass; otherwise the acting principal's `Role` must grant a matching permission key (`Roles.permissions`, e.g. `content.write`, `runs.read`). To gate your own collections:

1. Add your permission key to `PERMISSIONS` (and the `Roles.permissions` select options) in `src/collections/helpers/access.ts` + `src/collections/Roles.ts`.
2. Use it in your collection: `access: { create: requirePermission('orders.write'), read: () => true, … }`.
3. Grant it to roles via the admin (Roles → permissions), or in your seed.

This keeps the trust boundary: a principal can only read/write what its role grants. Never bypass it with `overrideAccess: true` in skills or endpoints.

## Guardrail rules (application-specific safety)

Applications can add their own input/output detection patterns via the **`Guardrails`** collection (admin) — no code change. Each rule is a regex with a `direction` (`input`/`output`/`both`), an `action` (`flag`/`block`/`redact`), an optional `agent` scope, and an `enabled` toggle. Examples: detect account numbers in input, mask PII in output.

Set the agent's `safetyMode` to `enforce` to reject blocking matches. The engine also redacts the actual configured `Provider` secrets by exact match, so provider-specific keys are covered automatically. See `docs/agents.md` → "Safety & guardrails".

## Working procedure for application developers

1. Read `AGENTS.md`, `docs/development.md`, `docs/agents.md`, `docs/mcp-connectivity.md`, `docs/retrieval.md`, `docs/provider-model.md`.
2. Model your company data as new collections with explicit access rules.
3. Model your agents as `Agent` records; configure provider/model via the `Provider` collection.
4. Write the skills your agents need (see "Writing skills" above) and select them on the agent's `tools`.
5. Write unit tests for any logic and e2e tests for each agent ↔ CMS path (see `docs/development.md`).
6. Never store provider keys in collections — reference env/secrets.
7. Verify nothing in the framework-owned list above was modified before you consider the work done.

## Migration guidance (from the `blog` prototype)

Existing single-function prototypes (e.g. the food-order agent writing to a Google Sheet) map onto AACMS as: Google Sheet → company-specific PayloadCMS collections; hardcoded order logic → `Agent` data + MCP skill tools; ad-hoc scripts → queue jobs; no eval → conversation logs/status captured by the framework.
