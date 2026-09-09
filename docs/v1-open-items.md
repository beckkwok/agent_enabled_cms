# v1 open items & decisions log

Working log for building the first version (AACMS). Each entry records the decision taken in design review, its open questions, and the recommended resolution to revisit at implementation.

## 1. Scaffold: copy the blog's Next.js + Payload layout (DECIDED)

- Copy the `blog` repo's shape as step 1: a single Next.js + Payload 3.x app with `app/(payload)` (admin/API) and `app/(frontend)` (web views).
- Use the blog's front-end layout as the initial FE.
- Consequence: AACMS is a Next.js monolith (front-end + admin + API in one), like its base. App projects built on top add collections/tools/views to that same app per `docs/building-applications.md`.
- **Done (initial scaffold commit):** blog copied and renamed to `agent-enabled-cms`; personal portfolio content stripped (About global, Projects, Contact + their FE pages/seed); `siteConfig` neutralised; RAG assistant persona neutralised; framework collections added (User `type` field + Role, Provider, Agent config referencing a User principal); MCP plugin wired with opt-in reads; legacy blog migrations removed (schema is `push`-driven in dev until core schema is finalised, then generate committed migrations).

## 2. Vector/chunk table write path (NOTED — resolve later)

- Tension: blog writes embeddings via a raw drizzle hook (`reindexKnowledge.ts`), bypassing Payload — which conflicts with AGENTS.md's "never write directly to DB".
- Open question: does chunk/embedding data count as LangChain-infra data (own write path outside the core-write rule) or must writes flow through a PayloadCMS endpoint/collection?
- Resolution deferred; record the decision before building the Document/reindex pipeline (roadmap step 2).

## 3. Human ↔ agent streaming method: framework-defined, app-implemented (DECIDED)

- Streaming may originate from the PayloadCMS front-end, an external workflow, or a non-web channel (e.g. a WhatsApp channel later). So the **channel is application-specific**, but the **method belongs in the framework**.
- Framework must provide: a reusable streaming method (SSE/stream abstraction) plus Chat session / Chat history storage, so any app channel can hook in.
- App developers then choose the transport per use case (FE page, WhatsApp adapter, etc.) and call the framework method. Update `docs/building-applications.md` accordingly when the method exists.

## 4. Seeding strategy (NOTED)

- "One-man-company bundles ship pre-configured" + multi-provider implies a seed script. Extend the blog `scripts/seed.ts` pattern to seed: roles, admin, Agent users, Provider records, and the default/fallback MCP API key.
- Document the pattern in v1.

## 5. User vs Agent: principals-in-User + separate Agent config collection (RESOLVED)

Verified against the `@payloadcms/plugin-mcp` source (`packages/plugin-mcp` @ 3.x).

### The constraint that shapes the model
MCP auth works like this:
- Every key lives in the plugin's own `payload-mcp-api-keys` collection.
- Each key's `user` is a **relationship to a single `userCollection`** (defaults to `config.admin.user`).
- At request time the key resolves to that user → `req.user`; collection access rules run against it.

Consequences:
- There is **one auth collection for principals** — the plugin cannot bind keys to two different auth collections (humans vs. agents).
- An "Agent-stored API key" doesn't authenticate by itself; the MCP endpoint only accepts keys in `payload-mcp-api-keys` bound to a user. An agent that queries data **must act under a principal row** in that user collection — the user's instinct was correct.

### Decision: separate the two meanings of "Agent"
- **`Agent` = the configurable thing** (prompts, provider → model, tools, status, kind) → its own CMS-managed collection (no auth). Matches "agents are configurable data, not hardcoded."
- **`User` = the security principal** (`req.user`) → one auth collection holding Admins, humans, **and** agent principals, distinguished by `type` (`User`/`Admin`/`Agent`).
- Each `Agent` config row has a `user` relationship → its `User` principal (type `Agent`). The MCP key is bound to that principal; the `Agent` row stores only a reference to the key/principal, never the credential.

So one agent = **one config row + one principal row** (+ one MCP key). Identity stays in `User` because that is what MCP/access control can see; config stays clean in `Agent`.

### Caveat (handle at implementation): plugin key issuance is self-service only
- `payload-mcp-api-keys.access`: create = any authenticated `userCollection` user; read/update/delete = only your **own** keys.
- The `user` field has `access: { create: () => false, update: () => false }` with `defaultValue = req.user.id`. Admin UI creates keys **bound to the creator only**; issuing on behalf of an Agent is blocked by default.
- To honour "one key per agent": provision keys **programmatically at Agent creation** via local API with `overrideAccess: true` and `user: <agentPrincipalId>`, or open cross-user issuance via `overrideApiKeyCollection`.
- Key lookup is by HMAC-SHA256 of the key against `payload.secret` stored as `apiKeyIndex` — an agent principal needs no usable password; it authenticates via the MCP key. Restrict `Agent`-type users from admin login/UI via collection access rules.

### Recommendation for v1
- `User` (auth): `type` (`User`/`Admin`/`Agent`) + `role` relationship; `Agent` principals here.
- `Agent` (no auth, config): kind, prompts, provider/model, tools, status, and `user` → its `User` principal.
- One provisioning flow creates `Agent` + its principal `User` + MCP key bound to the principal (seed or hook, `overrideAccess: true`) — one key per agent (audit identity) + one fallback key.
- Keep the admin-side default self-service rule unless a real need for admin cross-issuance appears.

## 6. RAG × access control (carried from docs/retrieval.md)

Open: retrieval must not return documents the caller cannot read via Payload access rules. See `docs/retrieval.md` for candidates.

## 7. Collection lifecycle (resolved — see docs/building-applications.md)

Payload has no runtime/admin schema builder. App collections are added in code at boot + `payload generate:types` + migrations. Full note in `docs/building-applications.md`.

## 8. Large-document ingestion for RAG (DECIDED: A for framework, B = app reference)

Current pipeline (`Knowledge` → `chunkText` → `reindexKnowledge` hook → `knowledge-chunks`) handles pasted **text** only and is not built for big uploads (e.g. 1000+ page PDF). Gap analysis:

- **No file upload.** `Knowledge.content` is a textarea; no PDF/upload field or text-extraction step exists.
- **`embedTexts` sends the whole array in one call** (`src/lib/embeddings.ts:44-49`) — a 1000+ page doc yields 10k–50k chunks, blowing past per-request/rate limits. Needs internal batching + retries.
- **Indexing is synchronous in the `afterChange` hook** (`reindexKnowledge.ts`) — large docs hang the save request. Should route through the Payload queue.
- Chunking itself is fine (800 chars / 200 overlap, boundary-snapped).

### Decision
- **Design A (quick) → framework baseline.** Implement in the core framework: upload/file field on `Knowledge`, text extraction for common formats, batched `embedTexts`, reindex as a Payload queue job, and document status fields. See plan A outline in this repo.
- **Design B (flexible) → application reference only.** Full ingestion pipeline (per-source extractors/OCR, per-page provenance, `IngestionRun` history, Provider-driven embedding, Document visibility × access control) is documented for apps that need large corporate document handling. Reference: `docs/large-document-ingestion.md`. App developers build it **on top of** the framework per `docs/building-applications.md` — it must not modify framework-owned schema.
