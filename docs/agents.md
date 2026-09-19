# Agents — runtime, run endpoint, queue, streaming

How agents are configured and executed in the framework. Covers both agent shapes: **single-shot** and **streaming**.

## Agent configuration (`Agents` collection)

An agent is **two rows**: its `Agent` config row plus a `User` principal of type `Agent` (`docs/v1-open-items.md` #5).

| Field | Purpose |
| --- | --- |
| `name` | Display name. |
| `kind` | `single-shot` or `streaming`. Both are runnable; `streaming` pairs with the stream endpoint. |
| `status` | `active` / `inactive` — inactive agents refuse runs. |
| `capabilities` | `knowledge` → retrieve context from the `Knowledge` base; `memory` → retrieve the agent's long-term memory. Both optional. |
| `tools` | CMS skills the agent may call during a run (see below). |
| `runAccess` | Who may call the run endpoint: `public` / `authenticated` (default) / `admin`. |
| `safetyMode` | Guardrails: `off` / `monitor` (default) / `enforce`. |
| `semanticSafety` | Opt-in semantic prompt-injection check (extra model call; default off). |
| `user` | The `User` principal (type `Agent`) the agent acts as; its MCP key is issued against this principal. |
| `provider` | `Provider` record used for the model. |
| `model` | Model id from the provider. |
| `prompt` | System prompt / instructions (rich text). |

## Runtime (`src/agents/`)

- `run.ts` — `runSingleShot({ payload, agentId, input, sessionId?, triggeredBy?, runId?, model? })`:
  1. loads the agent (provider populated),
  2. if `capabilities` includes `knowledge`, retrieves context via the framework hybrid RRF search (`src/lib/vectorSearch.ts`); if it includes `memory`, retrieves the agent's long-term memory (`src/lib/agent-memory.ts` → `searchMemory`),
  3. builds the system prompt (`prompt.ts`) + context (+ memory), binds the agent's `tools` as callable skills, and runs a tool-calling loop (max 5 iterations) until the model returns a final answer,
  4. persists an agent-scoped `ChatSession` + `ChatMessage`s,
  5. writes an `AgentRun` trace (status/input/output/timing), marks it `failed` on error, and (if `memory` is enabled) opportunistically triggers session summarisation.
- `model.ts` — `resolveAgentModel(agent)`: builds the chat model from the agent's Provider via `getChatModelForAgent` (`src/lib/provider-runtime.ts`). `MOCK_LLM=1` returns a `FakeListChatModel` for tests (no network/keys).
- `access.ts` — `checkAgentRunAccess(agent, req)` enforces `runAccess`.
- `prompt.ts` — `agentPromptToText(prompt)` extracts plain text from the rich-text prompt.

## Skills / tools (`src/agents/skills/`)

Skills are the CMS operations agents (and external MCP clients) may call. The same implementation is exposed two ways, so access control is identical:

1. **Agent tools** — an agent's `tools` are bound as LangChain tools during a run (`skills/langchain.ts` → `buildAgentTools`), and the model calls them in the tool loop.
2. **MCP custom tools** — the registry is registered in `payload.config.ts` under `mcp.tools`, callable by any MCP client with a key (per-key tool toggles in **MCP → API Keys**).

**Access control — two distinct layers:**

1. **Skill invocation** (who may call a skill): controlled by the admin-configured `Agent.tools` (runs), the per-key MCP tool toggles (`payload_mcp_tool_*`), **and** optional per-skill authorization (`requiredUserTypes` / `requiredRoles`).
2. **Skill data** (what a skill may return/change): skills call Payload with `overrideAccess: false` + `user` = the acting principal (the agent's `User` principal for runs, or the MCP key owner). Collection `access` rules therefore gate every Payload read/write. Skills must not use `overrideAccess: true`.

### Skill authorization (`requiredUserTypes` / `requiredRoles`)

A `Skill` may declare who is allowed to call it; `authorizeSkill` (`src/agents/skills/authorize.ts`) enforces it **before the handler runs**, in both the agent runtime and the MCP server:

- **Admins always pass.**
- `requiredUserTypes: ['Admin']` → only that user type.
- `requiredRoles: ['finance']` → the acting principal's Role **name** must match (a role id is resolved via Payload).
- No requirements → any principal.

On denial the skill returns `{ error: '…' }` and the handler is **not** called. This is separate from data access — the skill still runs with `overrideAccess: false`, so collection rules apply too.

All four framework skills are access-limited: `listContent`/`getContent`/`countContent` go through Payload directly, and `searchKnowledge` scopes retrieval to the Knowledge ids the caller may read (`docs/retrieval.md`, design A+B).

> Collection `access` is now role-aware via `requirePermission` (`src/collections/helpers/access.ts`) — see `docs/v1-open-items.md` #11. Admins always bypass; otherwise the acting principal's `Role` must grant the matching permission (`Roles.permissions`).

**Framework skills (v1):**

| MCP tool / skill name | Parameters (Zod) | Returns |
| --- | --- | --- |
| `searchKnowledge` | `query: string`, `limit?: number` (default 5, max 20) | `{ results: [{ content, similarity }] }` — hybrid RRF excerpts from the Knowledge base |
| `listContent` | `limit?: number` (default 10, max 50) | `{ posts: [{ title, slug, excerpt, publishedDate }] }` — published posts, newest first |
| `getContent` | `slug: string` | `{ post: { … } \| null }` — a single published post |
| `countContent` | *(none)* | `{ totalDocs: number }` — count of published posts |
| `saveMemory` | `content: string`, `kind?: 'fact'\|'preference'\|'summary'`, `agent?: number` (admin) | `{ id, agent, kind, content }` — saves to the agent's own long-term memory |

**Exposed over MCP:** all five are registered as MCP custom tools (`mcp.tools`) and appear in `tools/list` for any MCP client with a valid API key. Each key can enable/disable them individually under **MCP → API Keys** (the `payload_mcp_tool_*` toggles). See `docs/mcp-connectivity.md`.

> `searchKnowledge` is access-scoped: retrieval resolves the caller's allowed Knowledge ids via the access layer before the SQL search (`docs/retrieval.md`).
>
> Application projects register their own skills by extending `SKILLS` in `src/agents/skills/index.ts` — see **`docs/building-applications.md` → "Writing skills"** for the authoring guide (define, register, rules, migration, tests). They are automatically exposed both as agent tools and as MCP custom tools.

## Run endpoint

```
POST /api/agents/:id/run
Content-Type: application/json

{ "input": "string (required, <= 8000 chars)", "sessionId": "optional", "async": false }
```

- Access is governed by the agent's `runAccess` (`public` / `authenticated` / `admin`). `authenticated` returns **401** for anonymous; `admin` returns **403** for non-admins.
- `async: false` (default) runs inline → `200 { runId, output, sessionId }`.
- `async: true` creates a queued `AgentRun` and enqueues the `runAgent` job → `202 { runId, status: "queued" }`.

## Stream endpoint (streaming agents)

```
POST /api/agents/:id/stream
Content-Type: application/json

{ "input": "string (required, <= 8000 chars)", "sessionId": "optional" }
```

- Same body/validation/`runAccess` as `/run`, but responds **`text/event-stream`** (SSE).
- Events: `{ "type": "token", "content": "…" }` as the model produces text, then `{ "type": "done", runId, sessionId, output }` (or `{ "type": "error", message }`).
- The framework owns the streaming **method** (`src/agents/stream.ts` → `streamAgentRun`); the **channel** is the application's choice (web SSE, WhatsApp adapter, …). `collectStreamEvents(stream)` drains a stream into events (used by tests/servers).
- Streaming supports the same `knowledge` capability and access-controlled `tools` as single-shot: tool calls are executed mid-stream, then token streaming resumes.

## Safety & guardrails

The guardrail engine (`src/agents/guardrail-engine.ts`) merges these sources:

1. **Built-in heuristics** (`src/agents/guardrails.ts`): prompt-injection/jailbreak detection and secret/email redaction, including an **entropy heuristic** that catches unlabelled/unknown-provider secrets (e.g. Grok/xAI) by randomness — not just known prefixes.
2. **CMS rules** — the `Guardrails` collection (application-configurable regex rules, see below).
3. **Configured secrets** — the actual values behind enabled `Provider`s (`keyRef` env or pasted key) are redacted by **exact match**, so any provider is covered because it's *your* key.
4. **Optional semantic check** — `Agent.semanticSafety` (default **off**): a model-based prompt-injection classifier using the agent's own `Provider`. Generalises beyond regex (catches paraphrases) but costs an extra model call; fails open on error.

Per-agent `safetyMode`:

| Mode | Behaviour |
| --- | --- |
| `off` | Engine is a no-op. |
| `monitor` (default) | Scans + redacts; **flags** the run but does not block. |
| `enforce` | Blocks input that matches a blocking rule (built-in injection or a custom `block` rule) **and** blocks output that matches an output `block` rule (refuses to deliver it); redacts output. Streaming buffers + redacts before emitting tokens. |

### Configurable rules (`Guardrails` collection)

Applications add their own input/output patterns — e.g. a bank detecting account numbers. Each rule has:

| Field | Meaning |
| --- | --- |
| `name` | Identifier (appears in `flagReasons` as `custom:<name>` for `redact`, or `policy:<name>` for `flag`/`block`). |
| `direction` | `input` / `output` / `both`. |
| `action` | `flag` (record), `block` (reject in enforce mode), `redact` (replace matches). |
| `pattern` / `flags` | Regex source + flags (e.g. `\\b\\d{8}\\b`, `gi`). |
| `replacement` | Used when action is `redact` (default `[REDACTED]`). |
| `agent` | Optional: scope to one agent; empty = all agents. |
| `enabled` | Toggle. |

Invalid regexes are ignored safely. Rules apply only when the agent's `safetyMode` is not `off`.

**Default rules:** a data migration (`20260916_180000_default_guardrails`) installs starter rules — `credit-card`, `us-ssn`, `iban` (all `both`/`redact`). They are normal collection rows: edit or disable them in the admin, and add your own.

Flagged runs are recorded on `AgentRun` (`flagged`, `flagReasons` — e.g. `prompt-injection:dan, custom:bank-acct, configured-secret`).

**Flagged-run alerting:** the runtime calls `notifyFlaggedRun` (`src/agents/alerts.ts`) whenever a run is flagged or blocked (in both `/run` and `/stream`). By default it logs via `payload.logger` — `warn` for flagged runs, `error` for blocked runs — and apps can install their own sink (Slack, webhook, …) with `setAlertNotifier`. The alert carries only `runId`/`agentId`/`blocked`/`reasons`; raw input/output is deliberately excluded (may hold secrets or the injection payload).

**Entropy tuning:** the entropy heuristic (`looksLikeSecret`) requires three character classes (upper+lower+digit) and skips hash/ID shapes via `isLikelyHashOrId` (single-case hex, base64 padding/`+`/`/`), so txids, hashes and base64 blobs are no longer over-redacted. Tune `ENTROPY_THRESHOLD` in `src/agents/guardrails.ts` if further tuning is needed.

**Outgoing-prompt sanitisation:** `sanitizeRunMessages` (`src/agents/run.ts`) redacts secrets out of the assembled system prompt + retrieved context + session history + new input *before* they reach the model (`engine.sanitizePrompt`, secret-only — PII/emails are left intact so the agent can still cite them). A secret that leaked into a Knowledge doc or a prior turn is never shown to (and therefore cannot be repeated by) the model. Discovered prompt secrets are recorded on `AgentRun.flagReasons` with a `prompt:` prefix (e.g. `prompt:configured-secret`), so they are distinguishable from output redaction and trigger the same flagged-run alerting.

**Output content policy:** beyond secret/PII redaction, `engine.evaluateOutputPolicy` checks the model's output against `Guardrails` rules whose `action` is `flag` or `block` (rules with `action: redact` are excluded). A match records `policy:<name>` on the run; in `enforce` mode an output `block` match refuses to deliver the output and marks the run `failed` (mirroring input blocking). This is the deterministic, rule-based layer — e.g. `block` "guarantee a full refund" or `flag` off-policy/competitor claims. Toxicity/off-policy detection that generalises beyond regex (a semantic output check) is a follow-up.

**Red-team suite:** `tests/unit/guardrails.unit.spec.ts`, `tests/unit/guardrail-engine.unit.spec.ts`, `tests/unit/semantic-guard.unit.spec.ts`, `tests/unit/alerts.unit.spec.ts`, `tests/unit/prompt-sanitize.unit.spec.ts`, `tests/int/guardrails.int.spec.ts`, `tests/int/guardrails-config.int.spec.ts`.

**Inherent limits** (see `docs/v1-open-items.md` #9): regex/entropy detection is signature/heuristic-based — paraphrased injections and secrets that are neither configured nor random-looking can pass. The semantic check (opt-in) narrows the paraphrase gap but is itself a model. Treat guardrails as defence-in-depth, not the security boundary (that is tool/data access control + not putting secrets in context).

## Queue (`runAgent` task)

Defined in `src/payload.config.ts` (`jobs.tasks`) with the handler in `src/jobs/runAgent.ts`. The task calls `runSingleShot` with the pre-created `runId` and writes results back to `AgentRun`. Jobs are processed in-process by Payload's autorun cron (`jobs.autoRun`, every minute); call `payload.jobs.run()` to drain immediately.

## Trace (`AgentRuns` collection)

One row per run: `agent`, `status` (`queued`/`running`/`succeeded`/`failed`), `triggeredBy` (`api`/`queue`/`schedule`), `input`, `output`, `error`, `session`, `startedAt`, `completedAt`. Admin-only access; written by the runtime with `overrideAccess: true`. **Do not store secrets or customer PII in AgentRun.**

## Evaluation

The evaluation framework (roadmap step 4) scores agents against known expectations — a regression and safety gate on top of the `AgentRun` trace. See `docs/v1-open-items.md` #13.

- **`EvalCase`** (`eval-cases`) — one input per agent with an expectation: `type` (`correctness` / `tool-use` / `safety`), `match` (`exact` / `contains` / `judge`), `expected`, `expectFlagged`, `enabled`.
- **`EvalRun`** (`eval-runs`) — a batch for one agent (`queued`/`running`/`succeeded`/`failed`) with `caseCount`/`passed`/`failed`/`score` aggregate, `passThreshold`, and computed `gatePassed`. Creating a queued run auto-enqueues the `runEval` job (or call `createEvaluation`).
- **`EvalResult`** (`eval-results`) — one row per case: `output`, `toolCalls`, `flagged`/`flagReasons`, `pass`, `score`, `reasons`, and a link to the `AgentRun` trace.
- **Scorers** — deterministic (`src/eval/score.ts`): `correctness` (exact/contains vs `expected`), `tool-use` (the expected skill was called), `safety` (run flagged === `expectFlagged`); and semantic (`src/eval/judge.ts` → `judgeCorrectness`) for `match: 'judge'`, which grades meaning via the agent's model and fails closed.
- **Runner** (`src/eval/runner.ts` → `runEvaluation`) — runs each enabled case through `runSingleShot` (injectable `model`/`judgeModel` seams), aggregates the mean `score` + `passed`/`failed`, and applies the gate. The runtime also returns `toolCalls`/`flagged`/`flagReasons` so tool-use and safety cases are scorable.
- **Gate** — when `Agent.gateEnforced` is on and an `EvalRun` finishes with `score < passThreshold` (`gatePassed: false`), the runner sets the agent `status: inactive`.

## Conversation memory & attribution

**Storage (server-side, Postgres via Payload):** `ChatSession` (`sessionId`, `agent`) + `ChatMessage` (`session`, `role`, `content`). The client only needs to remember the `sessionId` and send it on each call; the memory itself lives in the framework collections (never in a separate LangChain memory store, to keep one source of truth).

**Short-term memory (implemented):** `src/agents/memory.ts` → `loadSessionHistory(payload, sessionId, limit = 20)` loads the most recent messages and returns them oldest → newest. `buildRunContext` prepends them, so both `/run` and `/stream` send `[system prompt, …prior turns, new input]` to the model. Pass `sessionId` for continuity; omit it for a stateless run.

**Attribution:** `ChatSession.agent` scopes conversations to an agent (multi-agent-ready). Messages inherit the agent via the session.

**Long-term memory (implemented, framework-owned):** facts/preferences that persist *across* sessions, in the `AgentMemory` collection (`agent-memories`):

- **Storage** — one short record per fact/preference/summary: `agent`, `owner` (the agent principal, set automatically), `kind`, `content`, optional `session`. Embedded (`embedding` + `search_tsv`) by the `indexMemory` queue job (mirrors Knowledge reindex).
- **Retrieval** — `searchMemory(payload, agentId, query, { limit, user })` (`src/lib/agent-memory.ts`) is a hybrid RRF search, access-scoped like Knowledge: only memories the caller (the agent principal) may read are searched. Enabled via the `memory` capability; results are injected as a `Long-term memory:` block in the system prompt.
- **Explicit writes** — the `saveMemory` skill (agent tool + MCP tool): the agent saves to its own memory (target agent inferred from the principal; admins may specify one).
- **Auto-summarisation** — after each run, `maybeSummarizeSession` enqueues the `summarizeMemory` job once a session gains `MEMORY_SUMMARIZE_THRESHOLD` (10) new messages; the job summarises the recent window with the agent's model into a `kind: summary` record. `ChatSession.summarizedCount` is the watermark.

See `docs/v1-open-items.md` #12. Store only non-sensitive summaries — never PII or credentials.

## Testing

- `MOCK_EMBEDDINGS=1` → deterministic vectors; `MOCK_LLM=1` → fake chat model.
- Unit: `tests/unit/agent-access.unit.spec.ts`, `agent-prompt.unit.spec.ts`, `skills.unit.spec.ts`, `stream.unit.spec.ts` (SSE encode/collect), `agent-memory.unit.spec.ts`, `extract.unit.spec.ts`, `guardrails.unit.spec.ts`, `memory.unit.spec.ts` (summarise).
- Integration: `tests/int/agent-run.int.spec.ts` — runs an agent, asserts `AgentRun` + `ChatMessage`s, and exercises the queue task; `tests/int/agent-tools.int.spec.ts` — the tool-calling loop with a scripted model; `tests/int/agent-stream.int.spec.ts` — streams tokens + persistence; `tests/int/agent-memory.int.spec.ts` — history is loaded and prepended into the prompt; `tests/int/guardrails.int.spec.ts` — safety modes; `tests/int/reindex.int.spec.ts` — ingestion job; `tests/int/memory.int.spec.ts` — long-term memory (save/search/capability/summarise).
- e2e: `tests/e2e/agent-run.e2e.spec.ts` — HTTP boundary (validation, 401 for authenticated agents, SSE content type, MCP keyless 401).

## Not yet implemented

- **Semantic output content policy** — a model-based toxicity/off-policy classifier on output (the rule-based layer is done; see `docs/v1-open-items.md` #9).
- **Rate limiting / abuse throttling** per agent/key — deferred to a later enhancement list (`docs/v1-open-items.md` #9).
- **Human-in-the-loop** for high-risk writes/deletes — deferred to a later enhancement list (`docs/v1-open-items.md` #9).
