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
- Custom MCP tools/resources/prompts that implement your business skills (write transaction, read, calculation/reporting), always passing `req` with `overrideAccess: false` + `user: req.user`.
- Queue jobs that trigger your agents and write status/results back through collections.
- Web views / front-end routes that display your data; register them in PayloadCMS.
- e2e tests for your agent ↔ CMS paths.

### Do not touch (framework-owned) — protect upgradeability

- **Core schema groups** — `Page`, `Post`, `Media` (CMS); `Agent`, `Chat session`, `Chat history` (Agent); `User`, `Role`, `Document`, `Provider` (Framework). These are the upgrade surface; changing them breaks future framework migrations.
- **Access-control architecture** — the role/user model and the rule that all reads/writes route through PayloadCMS.
- **Embedded LangChain.js agent runtime**, the `HybridSearchRetriever`/RRF retrieval, and the MCP plugin wiring in `payload.config.ts`.
- **Shared hooks/migrations** in framework paths. If you must extend behavior, extend by composition (new fields on *your* tables, hooks on *your* collections), not by editing shared framework files.

> Rule of thumb: if a framework upgrade (`git pull` / new framework release) would conflict with your edit, it belongs in the application layer, not a framework file.

## Working procedure for application developers

1. Read `AGENTS.md`, `docs/development.md`, `docs/mcp-connectivity.md`, `docs/retrieval.md`, `docs/provider-model.md`.
2. Model your company data as new collections with explicit access rules.
3. Model your agents as `Agent` records; configure provider/model via the `Provider` collection.
4. Expose business operations as MCP tools (skills); keep them single-purpose.
5. Write unit tests for any logic and e2e tests for each agent ↔ CMS path (see `docs/development.md`).
6. Never store provider keys in collections — reference env/secrets.
7. Verify nothing in the framework-owned list above was modified before you consider the work done.

## Migration guidance (from the `blog` prototype)

Existing single-function prototypes (e.g. the food-order agent writing to a Google Sheet) map onto AACMS as: Google Sheet → company-specific PayloadCMS collections; hardcoded order logic → `Agent` data + MCP skill tools; ad-hoc scripts → queue jobs; no eval → conversation logs/status captured by the framework.
