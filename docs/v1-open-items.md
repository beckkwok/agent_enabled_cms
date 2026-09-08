# v1 open items & decisions log

Working log for building the first version (AACMS). Each entry records the decision taken in design review, its open questions, and the recommended resolution to revisit at implementation.

## 1. Scaffold: copy the blog's Next.js + Payload layout (DECIDED)

- Copy the `blog` repo's shape as step 1: a single Next.js + Payload 3.x app with `app/(payload)` (admin/API) and `app/(frontend)` (web views).
- Use the blog's front-end layout as the initial FE.
- Consequence: AACMS is a Next.js monolith (front-end + admin + API in one), like its base. App projects built on top add collections/tools/views to that same app per `docs/building-applications.md`.

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

## 5. Users collection = MCP API-key owner: merge, with one caveat (RESOLVED)

Verified against the `@payloadcms/plugin-mcp` source (`packages/plugin-mcp` @ 3.x):

- The plugin generates its own `payload-mcp-api-keys` collection. Each key has a required `user` relationship to `userCollection`, which **defaults to `config.admin.user`** (i.e. the blog's `Users` collection). So blog `Users` and the MCP key owner are the **same collection — merge, no separate table needed**.
- Agents must therefore be rows in the **same `Users` collection** (a `type`/role field distinguishes `User`/`Admin`/`Agent`), so a key can bind to an Agent. This matches the AGENTS.md data model.
- **Caveat (the thing to handle now):** the plugin's default access is self-service only.
  - `payload-mcp-api-keys.access`: create = any authenticated `userCollection` user; read/update/delete = only your **own** keys.
  - The `user` field has `access: { create: () => false, update: () => false }` with `defaultValue = req.user.id`. So the admin UI lets you create a key **bound to yourself only**; issuing a key on behalf of an Agent is blocked by default.
  - To honour "one key per agent" you must either (a) provision keys **programmatically at Agent creation** via local API with `overrideAccess: true` and `user: <agentUserId>`, or (b) open cross-user issuance for trusted admins via `overrideApiKeyCollection` (relax the `user` field access / own-keys-only rules).
- Note: key lookup at request time is by HMAC-SHA256 of the key against `payload.secret` stored as `apiKeyIndex` — so an agent key needs no Agent password; it authenticates through the MCP key (agent rows may have unusable/empty local credentials). Restrict `Agent`-type users from admin login and the admin UI via collection access rules.

### Recommendation for v1
- Extend blog `Users` with `type` (`User`/`Admin`/`Agent`) and `role` fields.
- Provision agent keys in the same flow that creates an Agent user (seed or hook), using local API `overrideAccess: true` to bind `user: <agentId>` — one key per agent (audit identity) + one fallback key.
- Keep the admin-side default self-service rule unless a real need for admin cross-issuance appears.

## 6. RAG × access control (carried from docs/retrieval.md)

Open: retrieval must not return documents the caller cannot read via Payload access rules. See `docs/retrieval.md` for candidates.

## 7. Collection lifecycle (resolved — see docs/building-applications.md)

Payload has no runtime/admin schema builder. App collections are added in code at boot + `payload generate:types` + migrations. Full note in `docs/building-applications.md`.
