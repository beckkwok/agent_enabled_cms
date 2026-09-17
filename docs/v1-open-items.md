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
- **Status:** implemented. Framework streaming method `streamAgentRun` (`src/agents/stream.ts`) streams SSE `token`/`done`/`error` events, supports knowledge + access-controlled tools, and persists ChatSession/ChatMessage + AgentRun. Exposed via `POST /api/agents/:id/stream`. See `docs/agents.md`.

## 4. Seeding strategy (NOTED)

- "One-man-company bundles ship pre-configured" + multi-provider implies a seed script. Extend the blog `scripts/seed.ts` pattern to seed: roles, admin, Agent users, Provider records, and the default/fallback MCP API key.
- Document the pattern in v1.
- **Implemented (framework bootstrap):** `scripts/seed.ts` now seeds roles, providers, an admin, an Agent principal + config row, and the per-agent + default/fallback MCP keys (bound to their principals, capability toggles mirroring the MCP plugin config).

### MCP key storage & handoff (clarification + open item)
- **Storage:** `payload_mcp_api_keys.api_key` holds the raw key **encrypted** with `PAYLOAD_SECRET` (reversible, decrypt-on-read); `api_key_index` holds `HMAC-SHA256(secret, key)`. MCP authentication matches on the HMAC index — no decryption is needed to authenticate.
- **Agent retrieval:** agents do **not** read their key from the CMS. The seed prints the raw key **once**; the operator must copy it into the agent's env/secret store. The CMS verifies, it is not a key vault the agent queries.
- **Open:** no durable auto-provisioning handoff yet. Options when building agent deployment: (a) manual copy (current, fine for one-man setup); (b) provisioning hook writes the key to a secret store (Vault/SSM/K8s) the agent reads at boot; (c) deploy step injects it. Also note default key read access is **own-keys-only**, so cross-user (admin-issued) keys need `overrideApiKeyCollection` to be re-readable.

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

## 6. RAG × access control (RESOLVED — design A + B implemented)

Was: `hybridSearch` ran raw SQL with no per-user filtering. Now:

- **A.** `Knowledge` has `visibility` (`public`/`authenticated`/`role`/`private`), `owner`, `allowedRoles`; `Knowledge.access` is visibility-aware (`knowledgeReadAccess`).
- **B.** `hybridSearch(payload, query, { user })` resolves the caller's allowed Knowledge ids via `payload.find({ overrideAccess: false, user })` and scopes both the FTS and vector SQL to those ids. Callers pass the acting identity (agent principal / skill user / anonymous for the blog path).

See `docs/retrieval.md` for details and the option-D follow-up (denormalized per-chunk ACL) for very large corpora. Skill invocation is still not role-gated — see #11.

## 7. Collection lifecycle (resolved — see docs/building-applications.md)

Payload has no runtime/admin schema builder. App collections are added in code at boot + `payload generate:types` + migrations. Full note in `docs/building-applications.md`.

## 8. Large-document ingestion for RAG (Design A IMPLEMENTED; B = app reference)

### Implemented — Design A (framework baseline)
- **File upload** on `Knowledge` (`file` → Media) alongside the `content` textarea.
- **Text extraction** (`src/lib/extract.ts`): txt/md/csv/json/log, HTML (tag-stripped), PDF (`unpdf`). Unsupported types error clearly.
- **Batched embeddings** (`EMBEDDING_BATCH_SIZE = 100`) so large docs don't exceed provider limits.
- **Queue-based reindex** — publishing enqueues a `reindexKnowledge` job (`src/jobs/reindexKnowledge.ts`); the save request no longer blocks.
- **Status fields** on `Knowledge`: `indexStatus`, `chunkCount`, `extractedText`, `indexError`.

### Deferred — Design B (app reference only)
Full pipeline (per-source extractors/OCR, per-page provenance, `IngestionRun` history, Provider-driven embedding, Document visibility × access control) remains an app-layer reference: `docs/large-document-ingestion.md`. Apps build it **on top of** the framework per `docs/building-applications.md`.

### When to use which (guide)
- **`Knowledge` (framework, Design A)**: small–medium, text-oriented sources — a large text blob, `.md` file, plain/text-based PDF, or hand-maintained reference notes. Admin can paste or upload the file; pipeline chunks + embeds it directly. No page-level provenance or heavy structure expected.
- **Large-document ingestion (app-layer, Design B)**: very large corporate documents where fidelity, scale, provenance, and operability matter — 1000+ page PDFs, scanned archives (OCR needed), structured packs (tables/headings to preserve), anything needing per-page citations, ingestion history, retries, and Document-level access control. Built by the application on top of the framework.
- Rule of thumb: if "paste the text into a Knowledge doc" is acceptable for the content, use `Knowledge` (A). If you need upload-scale reliability, page citations, OCR/structure, run history, or doc-scoped visibility, design the app ingestion pipeline (B).

## 9. Agent disclosure of sensitive info during chat / red-team testing (OPEN — handle later)

Agents can be manipulated into leaking sensitive data (system prompts, internal config, credentials, data the caller shouldn't see) via prompt injection, jailbreaks, or data-exfiltration prompts. This is a security concern beyond RAG access control (#6): even data an agent *may* read must not be *disclosed* to the wrong party.

Threat surface to cover:
- **System-prompt / config leakage** — agent reveals its instructions, provider/model, keyRef names, internal tool list.
- **Data exfiltration** — tricking the agent into returning records the caller can't read (ties into #6), or PII/secret values from context or tools.
- **Tool abuse** — prompt injection steering MCP tool calls toward write/delete or broad reads.
- **Credential leakage** — provider keys / MCP keys surfacing in output or logs.

Candidate mitigations (to design later):
- **Input/output guardrails** — pre-prompt injection detection, output filtering/redaction before it reaches the user (mirror the MCP `overrideResponse` pattern), and secret/PII scanners on responses.
- **Least privilege by construction** — already partly in place: per-agent MCP keys with per-capability toggles, `overrideAccess: false`, field-level access (e.g. `Provider.apiKey` Admin-only). Ensure agents never hold credentials they don't need.
- **Never put secrets in model context** — keys stay out of prompts/context; reference by handle only.
- **Evaluation as a safety gate** — a red-team suite (prompt-injection, jailbreak, exfiltration cases) run as part of the agent evaluation framework (roadmap #4), with pass/fail gates before shipping an agent.
- **Observability** — log/alert on suspicious prompts and on tool calls that touch sensitive collections (feeds conversation logs + `onEvent`).
- **Human-in-the-loop** for high-risk operations (e.g. confirm before writes/deletes).

Status: **partially implemented.** Guardrails v1 is live (see `docs/agents.md` → "Safety & guardrails"): per-agent `safetyMode` (`off`/`monitor`/`enforce`), built-in prompt-injection detection + secret/PII redaction, an **entropy heuristic** for unlabelled secrets, **CMS-configurable rules** (`Guardrails` collection), **exact-match redaction of configured provider secrets**, and an **opt-in semantic injection check** (`Agent.semanticSafety`, off by default, uses the agent's provider). Run flags on `AgentRun` (`flagged`/`flagReasons`). Red-team suite: `tests/unit/guardrails*.spec.ts`, `tests/unit/semantic-guard.unit.spec.ts`, `tests/int/guardrails*.spec.ts`.

Remaining:
- **Output content policy** — beyond secrets/PII (toxicity, off-policy claims).
- **Rate limiting / abuse throttling** per agent/key.
- **Human-in-the-loop** for high-risk operations (confirm before writes/deletes).
- **Scan the outgoing prompt** (defence-in-depth if context ever contains a secret).
- Wire `onEvent`/conversation logs into alerting for flagged runs.
- Tune entropy threshold to reduce false positives on hashes/IDs.

> Note the inherent limit: detection is heuristic (regex/entropy) plus an optional model. Guardrails are defence-in-depth; the real boundary is tool/data access control + not putting secrets in context.

## 10. Provider API key: true server-side masking (RESOLVED)

The `Provider.apiKey` field is now masked **server-side** — the plaintext never reaches the browser:

- `afterRead` returns a sentinel (`API_KEY_MASK`, `src/lib/api-key-mask.ts`) instead of decrypting. Trusted server reads opt in with `context: { revealApiKey: true }` (e.g. `loadAgent`, guardrail secret loading).
- `beforeChange`: submitting the sentinel re-reads the stored key server-side (revealed) and re-encrypts it; an empty value clears; anything else is encrypted as a new key.
- The admin component (`src/components/admin/ApiKeyField.tsx`) renders the mask + replace input from the sentinel (no plaintext in form state / page source).
- Verified: `tests/unit/providers-field.unit.spec.ts`, `tests/int/provider-mask.int.spec.ts`.

Remaining (minor): rotate/validate keys, and a "reveal" admin action if ever needed.

**MCP API keys are also masked server-side** (the same policy applied to the plugin's `payload-mcp-api-keys` collection via `overrideApiKeyCollection`): the raw key never reaches the browser; trusted reads use `context: { revealApiKey: true }`, and submitting the mask preserves the stored key + HMAC index. See `docs/mcp-connectivity.md`.

## 11. Role-based authorization for skills and data (OPEN)

Two access layers exist and only one is currently role-aware (see `docs/agents.md`):

1. **Skill invocation** — gated by `Agent.tools` + per-key MCP tool toggles. **Not** role-aware: there is no check like "only Admin agents may call `countContent`".
2. **Skill data** — skills call Payload with `overrideAccess: false` + `user`, so collection access rules apply. But those rules are coarse (user-*type* based: `publicCollectionAccess` / `privateCollectionAccess`); the `User.role` relationship is not consulted anywhere yet.

Gaps to resolve:
- **Per-role skill gating** — add a check (e.g. a `skill.access` predicate or `requiredRoles` on each skill) that consults the acting user's `type`/`role` before running, so sensitive skills are Admin-only even when the tool is enabled.
- **Role-aware data rules** — collection `access` functions consult `User.role` only for `Knowledge` so far (via `allowedRoles` + `visibility: role`); other collections still use user-*type* rules (`publicCollectionAccess` / `privateCollectionAccess`). Extend a consistent role model across collections.
- **`searchKnowledge`** is now access-scoped (see #6); the remaining gap is per-role *skill invocation*.

Status: **open** — design the role model first (what a `Role` grants), then apply it consistently to both skill invocation and data access.

## 12. Long-term agent memory (OPEN)

Short-term conversation memory is implemented: `ChatSession`/`ChatMessage` in Postgres, loaded by `loadSessionHistory` (last-N window) and prepended to the prompt (`docs/agents.md`). What's missing is **long-term memory** — facts/preferences that persist *across* sessions and agents.

Options to design:
- **A dedicated `AgentMemory` collection** (framework-owned) with an embedding column, retrieved like Knowledge (hybrid search) and injected into the prompt. Scope by agent/principal so memory is access-controlled like everything else.
- **Summarisation** — periodically summarise a session into a compact memory record (bounds context and cost).
- **Retrieval policy** — when to fetch long-term memory (every run? on relevance?), and how to merge with short-term history + Knowledge context without bloating the prompt.

Constraints: store only non-sensitive summaries; never PII; all writes via PayloadCMS; retrieval must respect the caller's access (same rule as `docs/retrieval.md`).

Status: **open** — decide whether long-term memory is framework-owned (a collection + retriever) or an application concern.
