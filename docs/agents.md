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
| `runAccess` | Who may call the run endpoint: `public` / `authenticated` (default) / `admin`. |
| `user` | The `User` principal (type `Agent`) the agent acts as; its MCP key is issued against this principal. |
| `provider` | `Provider` record used for the model. |
| `model` | Model id from the provider. |
| `prompt` | System prompt / instructions (rich text). |

## Runtime (`src/agents/`)

- `run.ts` — `runSingleShot({ payload, agentId, input, sessionId?, triggeredBy?, runId? })`:
  1. loads the agent (provider populated),
  2. if `capabilities` includes `knowledge`, retrieves context via the framework hybrid RRF search (`src/lib/vectorSearch.ts`),
  3. builds the system prompt (`prompt.ts`) + context, then invokes the model,
  4. persists an agent-scoped `ChatSession` + `ChatMessage`s,
  5. writes an `AgentRun` trace (status/input/output/timing), and marks it `failed` on error.
- `model.ts` — `resolveAgentModel(agent)`: builds the chat model from the agent's Provider via `getChatModelForAgent` (`src/lib/provider-runtime.ts`). `MOCK_LLM=1` returns a `FakeListChatModel` for tests (no network/keys).
- `access.ts` — `checkAgentRunAccess(agent, req)` enforces `runAccess`.
- `prompt.ts` — `agentPromptToText(prompt)` extracts plain text from the rich-text prompt.

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
- Unit: `tests/unit/agent-access.unit.spec.ts`, `agent-prompt.unit.spec.ts`.
- Integration: `tests/int/agent-run.int.spec.ts` — runs an agent, asserts `AgentRun` + `ChatMessage`s, and exercises the queue task.
- e2e: `tests/e2e/agent-run.e2e.spec.ts` — HTTP boundary (validation, 401 for authenticated agents, MCP keyless 401).

## Not yet implemented

- **Streaming** agents + the framework streaming method (`docs/v1-open-items.md` #3).
- **Agent tools / CMS skills** via MCP custom tools.
- **RAG × access control** (`docs/retrieval.md` #6) — retrieval currently runs in a trusted/admin context.
- **Agent safety / red-team** (`docs/v1-open-items.md` #9).
