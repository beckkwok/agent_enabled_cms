# v1 open items & decisions log

Working log for building the first version (AACMS). Each entry records the decision taken in design review, its open questions, and the recommended resolution to revisit at implementation.

## 1. Scaffold: copy the blog's Next.js + Payload layout (DECIDED)

- Copy the `blog` repo's shape as step 1: a single Next.js + Payload 3.x app with `app/(payload)` (admin/API) and `app/(frontend)` (web views).
- Use the blog's front-end layout as the initial FE.
- Consequence: AACMS is a Next.js monolith (front-end + admin + API in one), like its base. App projects built on top add collections/tools/views to that same app per `docs/building-applications.md`.
- **Done (initial scaffold commit):** blog copied and renamed to `agent-enabled-cms`; personal portfolio content stripped (About global, Projects, Contact + their FE pages/seed); `siteConfig` neutralised; RAG assistant persona neutralised; framework collections added (User `type` field + Role, Provider, Agent config referencing a User principal); MCP plugin wired with opt-in reads; legacy blog migrations removed (schema is `push`-driven in dev until core schema is finalised, then generate committed migrations).

## 2. Vector/chunk table write path (RESOLVED — derived-index data)

Tension: embeddings are written via raw SQL, which *looks* like it bypasses Payload and the "never write directly to DB" rule.

**Decision: chunk/embedding data is LangChain-infra (a derived, regenerable index), not source-of-truth data.** It has a framework-owned write path that lives in system indexing jobs, with raw SQL **strictly limited to the non-Payload `embedding`/`search_tsv` columns** (pgvector/tsvector, which Payload has no field type for). The corpus source of truth always flows through Payload access control.

Boundary (the actual rule):

| Kind | Write path |
| --- | --- |
| **Source-of-truth data** (Knowledge docs, AgentMemory records, business collections) | Always through Payload, access-controlled (`overrideAccess: false` from skills; `overrideAccess: true` only for genuine system writes). |
| **Derived index data** (chunk rows + `embedding`/`search_tsv`) | System-only queue jobs (`reindexKnowledge`, `indexMemory`), `overrideAccess: true`; the *row* is created via `payload.create` and only the vector/tsv columns are written via raw SQL, in the same transaction. |

Why this is safe:

- The index is **fully regenerable** — delete the chunks/vectors and re-run reindex; nothing of value is lost. It is never the source of truth.
- The write path is **system-only**: triggered by `afterChange` hooks (enqueue) and run in queue jobs — not callable by users or agents.
- **Retrieval still goes through access control first**: `hybridSearch` / `searchMemory` resolve the allowed doc ids via `payload.find({ overrideAccess: false, user })` before the raw SQL search runs, so the index never leaks beyond what the access layer permits.
- The raw SQL is **column-scoped**: only `embedding`/`search_tsv`, on rows that were themselves created through Payload.

Applies equally to Knowledge (`reindexKnowledge`) and long-term memory (`indexMemory`). If embeddings ever need to be first-class Payload-managed fields, that's the option-D follow-up (custom field type) — not needed now.

## 3. Human ↔ agent streaming method: framework-defined, app-implemented (DECIDED)

- Streaming may originate from the PayloadCMS front-end, an external workflow, or a non-web channel (e.g. a WhatsApp channel later). So the **channel is application-specific**, but the **method belongs in the framework**.
- Framework must provide: a reusable streaming method (SSE/stream abstraction) plus Chat session / Chat history storage, so any app channel can hook in.
- App developers then choose the transport per use case (FE page, WhatsApp adapter, etc.) and call the framework method. Update `docs/building-applications.md` accordingly when the method exists.
- **Status:** implemented. Framework streaming method `streamAgentRun` (`src/agents/stream.ts`) streams SSE `token`/`done`/`error` events, supports knowledge + access-controlled tools, and persists ChatSession/ChatMessage + AgentRun. Exposed via `POST /api/agents/:id/stream`. See `docs/agents.md`.

## 4. Seeding strategy (NOTED)

- "One-man-company bundles ship pre-configured" + multi-provider implies a seed script. Extend the blog `scripts/seed.ts` pattern to seed: roles, admin, Agent users, Provider records, and the default/fallback MCP API key.
- Document the pattern in v1.
- **Implemented (framework bootstrap):** `scripts/seed.ts` now seeds roles, providers, an admin, an Agent principal + config row, and the per-agent + default/fallback MCP keys (bound to their principals, capability toggles mirroring the MCP plugin config).

### MCP key storage & handoff (RESOLVED — pluggable handoff, manual-copy default)

- **Storage:** `payload_mcp_api_keys.api_key` holds the raw key **encrypted** with `PAYLOAD_SECRET` (reversible, decrypt-on-read); `api_key_index` holds `HMAC-SHA256(secret, key)`. MCP authentication matches on the HMAC index — no decryption is needed to authenticate.
- **Agent retrieval:** agents do **not** read their key from the CMS. The CMS verifies, it is not a key vault the agent queries.
- **Decision:** the default handoff is **manual copy** (a) — the seed prints the raw key once; the operator copies it into the agent's env/secret store. For automated deployment (b/c — Vault/SSM/K8s write or a deploy-step inject), the framework exposes a pluggable sink: `src/lib/mcp-key-handoff.ts` → `setMcpKeyHandoff(fn)` / `handoffMcpKey({ label, key, userId })`. The seed calls `handoffMcpKey` on every new key; ops register their own sink (write to a secret store) in their seed/deploy script without framework changes.
- **Caveat:** default key read access is **own-keys-only**, so re-reading an admin-issued key later (for re-provisioning) requires `overrideApiKeyCollection` + `context: { revealApiKey: true }`.

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

Status: **implemented.** Guardrails v1 is live (see `docs/agents.md` → "Safety & guardrails"): per-agent `safetyMode` (`off`/`monitor`/`enforce`), built-in prompt-injection detection + secret/PII redaction, an **entropy heuristic** for unlabelled secrets, **CMS-configurable rules** (`Guardrails` collection), **exact-match redaction of configured provider secrets**, an **opt-in semantic injection check** (`Agent.semanticSafety`, off by default, uses the agent's provider), **outgoing-prompt sanitisation** (`sanitizeRunMessages`), **output content policy** (`evaluateOutputPolicy` — `Guardrails` `flag`/`block` rules applied to model output), and **flagged-run alerting** (`notifyFlaggedRun`). Run flags on `AgentRun` (`flagged`/`flagReasons`, with `prompt:`/`policy:`/`custom:` prefixes). Red-team suite: `tests/unit/guardrails*.spec.ts`, `tests/unit/semantic-guard.unit.spec.ts`, `tests/unit/prompt-sanitize.unit.spec.ts`, `tests/int/guardrails*.spec.ts`.

Follow-ups (rule-based layer is done; these generalise beyond regex):
- **Semantic output policy** — a model-based toxicity/off-policy classifier on output (mirrors the opt-in `semanticSafety` input check).

Deferred to a later enhancement list:
- **Rate limiting / abuse throttling** per agent/key.
- **Human-in-the-loop** for high-risk operations (confirm before writes/deletes).

Also done (implemented after the list above was written):
- **Flagged-run alerting** — the runtime calls `notifyFlaggedRun` (`src/agents/alerts.ts`) when a run is flagged or blocked; default logs `warn`/`error` via `payload.logger`, overridable with `setAlertNotifier` (Slack/webhook/…).
- **Entropy threshold tuning** — `looksLikeSecret` now requires three character classes (upper+lower+digit) and skips hash/ID shapes (`isLikelyHashOrId`: single-case hex, base64 padding/`+`/`/`), reducing false positives on txids/hashes/IDs.
- **Scan the outgoing prompt** — `sanitizeRunMessages` redacts secrets out of the assembled system prompt + context + history + input before it reaches the model (`engine.sanitizePrompt`, secret-only — PII/emails are left intact). A secret that leaked into a Knowledge doc or a prior turn is never shown to the model. Reason prefix `prompt:` on `flagReasons` distinguishes "secret going in" from output redaction.

> Note the inherent limit: detection is heuristic (regex/entropy) plus an optional model. Guardrails are defence-in-depth; the real boundary is tool/data access control + not putting secrets in context.

## 10. Provider API key: true server-side masking (RESOLVED)

The `Provider.apiKey` field is now masked **server-side** — the plaintext never reaches the browser:

- `afterRead` returns a sentinel (`API_KEY_MASK`, `src/lib/api-key-mask.ts`) instead of decrypting. Trusted server reads opt in with `context: { revealApiKey: true }` (e.g. `loadAgent`, guardrail secret loading).
- `beforeChange`: submitting the sentinel re-reads the stored key server-side (revealed) and re-encrypts it; an empty value clears; anything else is encrypted as a new key.
- The admin component (`src/components/admin/ApiKeyField.tsx`) renders the mask + replace input from the sentinel (no plaintext in form state / page source).
- Verified: `tests/unit/providers-field.unit.spec.ts`, `tests/int/provider-mask.int.spec.ts`.

Remaining (minor): rotate/validate keys, and a "reveal" admin action if ever needed.

**MCP API keys are also masked server-side** (the same policy applied to the plugin's `payload-mcp-api-keys` collection via `overrideApiKeyCollection`): the raw key never reaches the browser; trusted reads use `context: { revealApiKey: true }`, and submitting the mask preserves the stored key + HMAC index. See `docs/mcp-connectivity.md`.

## 11. Role-based authorization for skills and data (IMPLEMENTED)

Two access layers, now both role-aware (see `docs/agents.md`):

1. **Skill invocation** — gated by `Agent.tools` + per-key MCP tool toggles **and** per-skill `requiredUserTypes` / `requiredRoles` (`authorizeSkill`).
2. **Skill data** — skills call Payload with `overrideAccess: false` + `user`, so collection access rules apply. Collection rules are now **role-aware via permissions**, not just user-*type*:

- **`Roles.permissions`** — a `select` (hasMany) of framework permission keys (currently `content.write`, `runs.read`). This is the "what a Role grants" model (data, not role-name checks).
- **`requirePermission(permission)`** (`src/collections/helpers/access.ts`) — an access guard: Admins always pass; otherwise the acting principal's `Role` must grant the permission (resolved via Payload, no name matching).
- **Applied to framework collections**: `BlogPosts`/`Media` write → `content.write`; `AgentRuns` read → `runs.read` (admins still bypass). `Knowledge`/`AgentMemory` keep their richer visibility/owner models.
- **Escalation closed**: `User.type` and `User.role` are now admin-only to update (field-level access), so a principal cannot self-promote to `Admin` or assign itself a privileged role.
- **Seed/migration** grants defaults: `admin` → all, `user` → `content.write` (preserves current behaviour), `agent` → none.

Tests: `tests/unit/permission-access.unit.spec.ts`, `tests/int/role-access.int.spec.ts`.

Apps extend this by adding permission keys to `PERMISSIONS` + the `Roles.permissions` select options, then gating their own collections with `requirePermission` (see `docs/building-applications.md`).

## 12. Long-term agent memory (IMPLEMENTED — framework-owned)

Short-term conversation memory (`ChatSession`/`ChatMessage`, `loadSessionHistory`) now has a framework-owned **long-term** layer that persists facts/preferences across sessions:

- **`AgentMemory` collection** (`agent-memories`) — one short record per fact/preference/summary, scoped to an `agent` and owned by that agent's `User` principal. `embedding` + `search_tsv` columns are added via the pgvector schema hook; access is admin OR the agent principal (`owner`).
- **Retrieval** — `searchMemory` (`src/lib/agent-memory.ts`) is a hybrid (RRF) search over one agent's memories, access-scoped the same way as Knowledge retrieval. Wired into the run prompt via the new **`memory` capability** (`Agent.capabilities`), injected as a `Long-term memory:` block alongside Knowledge context.
- **Explicit writes** — the `saveMemory` skill (`src/agents/skills/saveMemory.ts`): an agent saves to its own memory (target agent inferred from the principal; admins may specify one). Exposed as both an agent tool and an MCP custom tool.
- **Auto-summarisation** — `maybeSummarizeSession` (called after each run when the agent has `memory`) enqueues the `summarizeMemory` job once a session crosses `MEMORY_SUMMARIZE_THRESHOLD` (10) new messages; the job summarises the recent window (agent's model) into a `kind: summary` memory. `ChatSession.summarizedCount` is the watermark.
- **Indexing** — memory records are embedded via the `indexMemory` queue job (mirrors Knowledge reindex; single record, no chunking).

Constraints honoured: non-sensitive content only, all writes via PayloadCMS, retrieval respects the caller's access. Known simplification: the summariser compacts the most-recent window (last N messages), and the watermark is optimistic at enqueue time.

Follow-ups: cross-agent/shared memory, a `Role`-based memory visibility model, and relevance-gated retrieval (only fetch memory when relevant) rather than always-on.

## 13. Agent evaluation framework (IMPLEMENTED)

Roadmap step 4. The full "run a dataset → score → gate" loop is implemented (`docs/agents.md` → "Evaluation"):

- **`EvalCase`** — one input per agent with an expectation (`type`, `match`, `expected`, `expectFlagged`).
- **`EvalRun`** / **`EvalResult`** — a batch + one scored row per case (with a link to the `AgentRun` trace). Creating a queued run auto-enqueues the `runEval` job.
- **Deterministic scorers** (`src/eval/score.ts`) — correctness (exact/contains), tool-use (expected skill called), safety (flagged === `expectFlagged`).
- **Semantic scorer** (`src/eval/judge.ts` → `judgeCorrectness`) — opt-in `EvalCase.match: 'judge'` grades meaning with the agent's model (paraphrases/synonyms get credit). Fails closed.
- **Runner** (`src/eval/runner.ts`) — `runEvaluation` runs enabled cases through `runSingleShot` (injectable `model`/`judgeModel` seams), aggregates `score` (mean) + `passed`/`failed`, and applies the gate. The runtime returns `toolCalls`/`flagged`/`flagReasons`.
- **Gate** — `EvalRun.passThreshold` + computed `gatePassed`; when `Agent.gateEnforced` is on and the gate fails, the runner deactivates the agent (`status: inactive`).

Remaining (later):
- **Metrics surface** — an admin view/endpoint for pass-rate over time, per-`type`/`tag` breakdown, safety-violation counts.
- **Red-team suite wiring** — a packaged set of `safety` cases + a CI hook so it runs as part of release checks.
