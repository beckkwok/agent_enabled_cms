# Development & testing guide

Guide for any development in AACMS. Read before writing code.

## Rules

1. **Unit tests are required for any code change** (feature, fix, or refactor). No change lands without tests covering its logic.
2. **End-to-end tests must cover the agent ↔ CMS path.** An agent change is only "done" when an e2e test proves the agent reaches the CMS through the access-control layer and the CMS responds correctly.
3. Follow the test layout/conventions inherited from the `blog` repo (vitest + Playwright).

## Layout (blog conventions)

Mirror the `blog` repo structure under `tests/`:

- `tests/` — root for all tests, organized by layer, not by feature.
- `*.unit.spec.ts` (vitest) — pure logic in isolation: RRF fusion math, chunking, prompt/config builders, retriever internals. Mock all external calls (embeddings, LLM).
- `*.int.spec.ts` (vitest) — PayloadCMS against a test database: collection CRUD, access-control rules, hooks, queue jobs, MCP tool handlers via `payload.find/create/update`, hybrid search over seeded docs.
- `*.e2e.spec.ts` (Playwright) — browser/full-stack flows, including the **agent ↔ CMS** path described below.
- `tests/helpers/` — shared setup: seed users/agents/documents, login helper, MCP API-key fixture, DB reset. (`blog` has `seedUser.ts`, `login.ts` — extend for agents and keys.)

### Scripts (in `package.json`)

Match blog naming and add a unit script:

```jsonc
{
  "scripts": {
    "test": "pnpm run test:unit && pnpm run test:int && pnpm run test:e2e",
    "test:unit": "vitest run --config ./vitest.config.mts tests/**/*.unit.spec.ts",
    "test:int": "cross-env NODE_OPTIONS=--no-deprecation vitest run --config ./vitest.config.mts",
    "test:e2e": "cross-env NODE_OPTIONS=\"--no-deprecation --import=tsx/esm\" playwright test --config=playwright.config.ts"
  }
}
```

## What unit tests must cover

For each change:

- Pure functions (e.g. RRF `hybridSearch` merging, chunk splitting, score/weight logic) — deterministic inputs, assert order + scores.
- Collection config: field schema, required constraints, defaults, hooks fire on the right events.
- Access control: each collection's `access` rules return expected results for `User` / `Admin` / `Agent` / anonymous.
- Retriever: `HybridSearchRetriever` returns LangChain `Document`s from mocked search results.
- MCP custom tools: handler builds the right Payload operation and passes `overrideAccess: false` + `user: req.user`.

## End-to-end tests: the agent ↔ CMS path

An e2e test must exercise the full trust boundary the architecture promises. A complete scenario asserts:

1. **Agent identity** — an MCP request carries an API key bound to an `Agent` user; the CMS resolves the key owner.
2. **Allowed tool call** — the agent (via MCP `tools/call`) performs an operation its role permits; assert the data written/read lands through PayloadCMS.
3. **Denied tool call** — the same agent calls an operation its role or API-key capabilities forbid; assert rejection (e.g. 4xx / MCP error), and that nothing was written.
4. **No-key rejection** — a request without a Bearer key is rejected immediately.
5. **Queue-triggered agent** — enqueue an agent job, assert the job runs in-process and writes status/results back through a PayloadCMS collection.
6. **Human view** — the admin UI / web view shows what the agent produced (management interface requirement).

Where a real LLM/embedding call would make tests flaky or paid, use the blog pattern of mockable providers (e.g. `MOCK_EMBEDDINGS`) and inject a stub model — see `docs/provider-model.md`.

## Environment for tests

- Separate test database; never run against local dev data.
- Deterministic seeds: users, agents, roles, documents, and an MCP API-key fixture.
- No real provider keys in CI — mock providers.
