# Agents — runtime, run endpoint, queue

How agents are configured and executed in the framework. This is roadmap step 3 (single-shot first; streaming is next — see `docs/v1-open-items.md` #3).

## Agent configuration (`Agents` collection)

An agent is **two rows**: its `Agent` config row plus a `User` principal of type `Agent` (`docs/v1-open-items.md` #5).

| Field | Purpose |
| --- | --- |
| `name` | Display name. |
| `kind` | `single-shot` (implemented) or `streaming` (next). |
| `status` | `active` / `inactive` — inactive agents refuse runs. |
| `capabilities` | `knowledge` → retrieve context from the `Knowledge` base before answering. |
| `tools` | CMS skills the agent may call during a run (see below). |
| `runAccess` | Who may call the run endpoint: `public` / `authenticated` (default) / `admin`. |
| `user` | The `User` principal (type `Agent`) the agent acts as; its MCP key is issued against this principal. |
| `provider` | `Provider` record used for the model. |
| `model` | Model id from the provider. |
| `prompt` | System prompt / instructions (rich text). |

## Runtime (`src/agents/`)

- `run.ts` — `runSingleShot({ payload, agentId, input, sessionId?, triggeredBy?, runId?, model? })`:
  1. loads the agent (provider populated),
  2. if `capabilities` includes `knowledge`, retrieves context via the framework hybrid RRF search (`src/lib/vectorSearch.ts`),
  3. builds the system prompt (`prompt.ts`) + context, binds the agent's `tools` as callable skills, and runs a tool-calling loop (max 5 iterations) until the model returns a final answer,
  4. persists an agent-scoped `ChatSession` + `ChatMessage`s,
  5. writes an `AgentRun` trace (status/input/output/timing), and marks it `failed` on error.
- `model.ts` — `resolveAgentModel(agent)`: builds the chat model from the agent's Provider via `getChatModelForAgent` (`src/lib/provider-runtime.ts`). `MOCK_LLM=1` returns a `FakeListChatModel` for tests (no network/keys).
- `access.ts` — `checkAgentRunAccess(agent, req)` enforces `runAccess`.
- `prompt.ts` — `agentPromptToText(prompt)` extracts plain text from the rich-text prompt.

## Skills / tools (`src/agents/skills/`)

Skills are the CMS operations agents (and external MCP clients) may call. The same implementation is exposed two ways, so access control is identical:

1. **Agent tools** — an agent's `tools` are bound as LangChain tools during a run (`skills/langchain.ts` → `buildAgentTools`), and the model calls them in the tool loop.
2. **MCP custom tools** — the registry is registered in `payload.config.ts` under `mcp.tools`, callable by any MCP client with a key (per-key tool toggles in **MCP → API Keys**).

**Access control — two distinct layers:**

1. **Skill invocation** (who may call a skill): controlled by the admin-configured `Agent.tools` (runs) and the per-key MCP tool toggles (`payload_mcp_tool_*`). This is *not* currently role-aware — there is no per-role skill authorization yet (`docs/v1-open-items.md` #11).
2. **Skill data** (what a skill may return/change): skills call Payload with `overrideAccess: false` + `user` = the acting principal (the agent's `User` principal for runs, or the MCP key owner). Collection `access` rules therefore gate every Payload read/write. Skills must not use `overrideAccess: true`.

All four skills are access-limited: `listContent`/`getContent`/`countContent` go through Payload directly, and `searchKnowledge` scopes retrieval to the Knowledge ids the caller may read (`docs/retrieval.md`, design A+B).

> Also note the current collection rules are coarse (user-*type* based: `publicCollectionAccess` / `privateCollectionAccess`), and `User.role` is not consulted anywhere yet. Fine-grained role gating for skills and data is a follow-up (see `docs/v1-open-items.md`).

**Framework skills (v1):**

| MCP tool / skill name | Parameters (Zod) | Returns |
| --- | --- | --- |
| `searchKnowledge` | `query: string`, `limit?: number` (default 5, max 20) | `{ results: [{ content, similarity }] }` — hybrid RRF excerpts from the Knowledge base |
| `listContent` | `limit?: number` (default 10, max 50) | `{ posts: [{ title, slug, excerpt, publishedDate }] }` — published posts, newest first |
| `getContent` | `slug: string` | `{ post: { … } \| null }` — a single published post |
| `countContent` | *(none)* | `{ totalDocs: number }` — count of published posts |

**Exposed over MCP:** all four are registered as MCP custom tools (`mcp.tools`) and appear in `tools/list` for any MCP client with a valid API key. Each key can enable/disable them individually under **MCP → API Keys** (the `payload_mcp_tool_*` toggles). See `docs/mcp-connectivity.md`.

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

## Queue (`runAgent` task)

Defined in `src/payload.config.ts` (`jobs.tasks`) with the handler in `src/jobs/runAgent.ts`. The task calls `runSingleShot` with the pre-created `runId` and writes results back to `AgentRun`. Jobs are processed in-process by Payload's autorun cron (`jobs.autoRun`, every minute); call `payload.jobs.run()` to drain immediately.

## Trace (`AgentRuns` collection)

One row per run: `agent`, `status` (`queued`/`running`/`succeeded`/`failed`), `triggeredBy` (`api`/`queue`/`schedule`), `input`, `output`, `error`, `session`, `startedAt`, `completedAt`. Admin-only access; written by the runtime with `overrideAccess: true`. **Do not store secrets or customer PII in AgentRun.**

## Chat attribution

`ChatSession.agent` scopes conversations to an agent (multi-agent-ready). Messages inherit the agent via the session.

## Testing

- `MOCK_EMBEDDINGS=1` → deterministic vectors; `MOCK_LLM=1` → fake chat model.
- Unit: `tests/unit/agent-access.unit.spec.ts`, `agent-prompt.unit.spec.ts`, `skills.unit.spec.ts`.
- Integration: `tests/int/agent-run.int.spec.ts` — runs an agent, asserts `AgentRun` + `ChatMessage`s, and exercises the queue task; `tests/int/agent-tools.int.spec.ts` — the tool-calling loop with a scripted model.
- e2e: `tests/e2e/agent-run.e2e.spec.ts` — HTTP boundary (validation, 401 for authenticated agents, MCP keyless 401).

## Not yet implemented

- **Streaming** agents + the framework streaming method (`docs/v1-open-items.md` #3).
- **RAG × access control** (`docs/retrieval.md` #6) — retrieval currently runs in a trusted/admin context.
- **Agent safety / red-team** (`docs/v1-open-items.md` #9).
