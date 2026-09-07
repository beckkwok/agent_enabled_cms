# AGENTS.md

Guidance for AI coding agents working in this repository. Read this first. It defines what this project is, the non-negotiable architecture rules, and the conventions to follow when writing code.

## Project purpose

`agent_enabled_cms` (AACMS) is an **agent-enabled content management system**: a PayloadCMS application that manages content, data, and agents together, with agents working on your behalf out of the box.

It evolves from the 'food_delivery' project (https://github.com/beckkwok/food_delivery) , which was a single-function prototype: a food-order agent accepting orders and writing them to a Google Sheet. That prototype was limited — code changes were required whenever the function changed, there was no management UI for new orders, and no evaluation framework for the agent.

This project replaces that model with a general framework: a central, CMS-managed data layer that agents and humans both operate against, protected by a user/role access mechanism.

## Base and lineage

- Derived from: `blog` project (https://github.com/beckkwok/blog) — the existing food-order/PayloadCMS prototype is the migration source.
- Content is written in TypeScript; schema is defined at compile time.

## Architecture (non-negotiable)

Three layers. Code you write must respect this layering.

```
 Agent tier            LangChain.js (embedded in PayloadCMS)
                        agents live here; identified by agent ID
                        triggers: CMS front-end/MCP, backend queue, scheduler
                                |
                                |  agent ops / tool calls via CMS access control
                                v
 App tier              PayloadCMS  <----------------------- admin UI / web views
 (this repo)           TypeScript collections             (humans, front-end)
                       access control + API endpoints + MCP server + queue
                                |
                                |  all reads/writes via PayloadCMS
                                v
 Data tier             PostgreSQL
                       source of truth: CMS collections + LangChain data
                       (vectors, doc indexes, session state)

 Agent / Front-end -> PayloadCMS API -> PostgreSQL   (agents never own the source of truth)
```

### 1. PostgreSQL — database server

- Single source of truth.
- Supports PayloadCMS collections (TypeScript-defined) and LangChain data (vectors, doc indexes, session state).

### 2. PayloadCMS — application tier (main app in this repo)

- Data collections defined in TypeScript (strong typing).
- **All data access is protected by PayloadCMS** access control — never bypass it.
- **All data writes go through PayloadCMS** for core logic — never write directly to the DB around it.
- Provides:
  - Admin UI for human management + web views for data display.
  - API endpoints for agent/role-specific logic.
  - MCP server via `@payloadcms/plugin-mcp` so agents/AI tools call the CMS through the same access-control layer.
  - Queue object (Payload queue) for background jobs.
  - LangChain dataset/config storage.
  - Front-end host.
- All data is guarded by user/role access: only valid users/agents reach the corresponding information.

### CMS ↔ Agent connectivity

Agents talk to the CMS only through Payload's access-control layer. Two channels, both opt-in per capability:

- **MCP server (`@payloadcms/plugin-mcp`)** — the primary channel for agent tool/skill calls.
  - Authorization is two-layer: (1) a collection/global is enabled in plugin config with explicit operations (`find`/`create`/`update`/`delete`); (2) a per-key allow/disallow is toggled in the admin **MCP → API Keys** collection.
  - Every request must carry a valid API key as a Bearer token; keyless requests are rejected.
  - Each API key is bound to a Payload **user** (incl. an `Agent` user) and inherits that user's collection access rules, hooks, and role restrictions — the trust boundary is preserved, not bypassed. Pass `req` through with `overrideAccess: false` and `user: req.user` in custom tools so the key owner's rules still gate the call.
  - Custom skill tools (`mcp.tools`) receive `(args, req)`; custom prompts and resources are supported. `onEvent` gives an audit/observability hook; `overrideResponse` sanitizes what the model sees.
  - API-key policy (decided): **one key per agent** (audit identity) + **one default/fallback key** — see `docs/mcp-connectivity.md`.
- **Queue (Payload queue)** — for backend-triggered / scheduled agent jobs. Job handlers run in-process in PayloadCMS and can enqueue agent work; results/status are written back through PayloadCMS collections.

### 3. LangChain.js (embedded in PayloadCMS) — agent tier

LangChain.js is embedded in the PayloadCMS process. No separate Python LangChain runtime — this keeps the trust boundary tight: an agent can only reach data through PayloadCMS, and it identifies itself by its own agent ID.

- Agents live here, identified by agent ID.
- Triggers:
  - PayloadCMS front-end / MCP.
  - Backend via queue.
  - Scheduler.
- Agent configuration is stored in PayloadCMS (agents are configurable data, not hardcoded).
- Agent ops/tool calls go through CMS access control — the CMS never hands raw DB access to an agent.

### Cross-cutting rule

Data flow: `Agent / Front-end → PayloadCMS API (incl. MCP) → PostgreSQL`. Agents never own the source of truth; the CMS does.

## Data model categories

Define tables within these groups:

| Category | Default collections |
| --- | --- |
| **CMS** | Page (static), Blog/Post (user updates), Media |
| **Agent** | Agent (metadata), Chat session, Chat history |
| **Framework** | User (username, user type `User`/`Admin`/`Agent`, role id), Role, Document (indexed for RAG, agent-processable) |

> This is a **framework** project. The groups above are the core schema. Company/application-specific tables (e.g. menu, order, quotation) are not part of this repo — application projects are built on top of this framework.

## Agent types

Two shapes to support:

1. **Single-shot agent** — runs one operation and returns a result (transactional/task agents).
2. **Streaming agent** — conversational (chatbot), streams responses.

## Product features to preserve

- Enterprise-grade, highly customisable, "one-man-company" bundles: agents ship pre-configured with clear content + access rights, come with a company portal ready at go-live, and are harnessed by API logic on operations like quotation so results are trusted.
- CMS managed like a normal CMS, plus agents bundled in. Built-in agent roles (front-end customisable):
  - Customer-facing agent — customer support.
  - Marketing agent — promotes user content.
  - Administrative agent — internal business logic.
  - Report agent — management/processing requests.
- Content management covers both **external publish** (pages/blog/media) and **internal documents** (sales data, playbooks).
- Agent management in CMS: create agents, manage prompts.
- Agent lifecycle observability: conversations logged, status captured, multi-agent collaboration supported.
- CMS exposes APIs for agent skills/operations: write transactions, read operations, calculation/reporting.

## Roadmap (do not assume shipped until verified in code)

1. Migrate the `blog` repo to this repo.
2. Define core table schemas (groups above).
3. Implement agent types, then agent-enabled applications on top of the framework.
4. Agent evaluation framework — conversation logs, status capture, evaluation of agent results.
5. Multi-agent orchestration / collaboration workflows.

## Conventions for code in this repo

- TypeScript throughout the app tier; schemas compile-time typed.
- One feature/function per agent or collection; avoid monolithic, purpose-locked functions.
- Never hardcode agent prompts, roles, or configuration — model them as PayloadCMS collections.
- Keep collection access-control rules explicit and least-privilege; mark user types `User`/`Admin`/`Agent`.
- Routing of agent operations → CMS API, not direct DB.

## Docs inventory

- `AGENTS.md` — this file (agent/coder guidance).
- `docs/` — design & scenario notes:
  - `docs/mcp-connectivity.md` — MCP access-control model and agent-API-key design decision.
