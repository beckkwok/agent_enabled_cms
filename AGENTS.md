# AGENTS.md

Guidance for AI coding agents working in this repository. Read this first. It defines what this project is, the non-negotiable architecture rules, and the conventions to follow when writing code.

## Project purpose

`agent_enabled_cms` (AACMS) is an **agent-enabled content management system**: a PayloadCMS application that manages content, data, and agents together, with agents working on your behalf out of the box.

It evolves from the `blog` project (https://github.com/beckkwok/blog), which was a single-function prototype: a food-order agent accepting orders and writing them to a Google Sheet. That prototype was limited — code changes were required whenever the function changed, there was no management UI for new orders, and no evaluation framework for the agent.

This project replaces that model with a general framework: a central, CMS-managed data layer that agents and humans both operate against, protected by a user/role access mechanism.

## Base and lineage

- Derived from: `blog` project (https://github.com/beckkwok/blog) — the existing food-order/PayloadCMS prototype is the migration source.
- Keep PayloadCMS (not Strapi). Rationale (archive): Payload is strongly typed (DB schema defined at compile time, DB called directly) → faster AI-agent development; fine-grained access control; full program control over content; queue object for background work (Strapi relies on cronjobs).
- Content is written in TypeScript; schema is defined at compile time.

## Architecture (non-negotiable)

Three layers. Code you write must respect this layering.

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
  - Queue object (Payload queue) for background jobs.
  - LangChain dataset/config storage.
  - Front-end host.
  - (Planned) WebMCP layer so agents can call the CMS.
- All data is guarded by user/role access: only valid users/agents reach the corresponding information.

### 3. LangChain.js (embedded) or LangChain (Python, independent) — agent tier

- Agents live here.
- Triggers:
  - PayloadCMS front-end / WebMCP.
  - Backend via queue.
  - Scheduler.
- Agent configuration is stored in PayloadCMS (agents are configurable data, not hardcoded).

### Cross-cutting rule

Data flow: `Agent / Front-end → PayloadCMS API → PostgreSQL`. Agents never own the source of truth; the CMS does.

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

1. Migrate the `blog` food-order prototype into this repo.
2. Define core table schemas (groups above).
3. Implement agent types, then agent-enabled applications on top of the framework.

## Conventions for code in this repo

- TypeScript throughout the app tier; schemas compile-time typed.
- One feature/function per agent or collection; avoid monolithic, purpose-locked functions.
- Never hardcode agent prompts, roles, or configuration — model them as PayloadCMS collections.
- Keep collection access-control rules explicit and least-privilege; mark user types `User`/`Admin`/`Agent`.
- Routing of agent operations → CMS API, not direct DB.

## Docs inventory

- `AGENTS.md` — this file (agent/coder guidance).
- `docs/` — (create as needed) design & scenario notes e.g. SME Customer Service food-order scenario.
