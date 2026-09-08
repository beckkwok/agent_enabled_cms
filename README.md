# AACMS — Agent-Enabled CMS

A PayloadCMS + LangChain.js framework that manages content, data, and agents together, with agents working on your behalf out of the box.

## What this is

AACMS is a **framework**: a central, CMS-managed data layer that agents and humans both operate against, protected by a user/role access mechanism. It replaces the single-function food-order prototype (`https://github.com/beckkwok/food_delivery`) with a general framework whose schema (CMS / Agent / Framework groups) and agent runtime are shared across application projects.

- Derived from the `blog` project (https://github.com/beckkwok/blog).
- Three layers: LangChain.js agents (embedded) → PayloadCMS app tier (this repo) → PostgreSQL.
- All data flows `Agent / Front-end → PayloadCMS API (incl. MCP) → PostgreSQL`.

## Docs

Read these before working in the repo:

- `AGENTS.md` — architecture, conventions, and guidance for coding agents.
- `docs/development.md` — testing rules/layout (unit + agent ↔ CMS e2e).
- `docs/mcp-connectivity.md` — MCP access-control model and agent-API-key decision.
- `docs/provider-model.md` — Provider collection (provider + API key + model pairing).
- `docs/retrieval.md` — hybrid (RRF) vector search decision and RAG × access-control open item.
- `docs/building-applications.md` — contract for app developers extending the framework.
- `docs/v1-open-items.md` — design-stage decisions/open questions for v1.

## Quick start

```bash
cp .env.example .env   # set DATABASE_URL, PAYLOAD_SECRET, provider keys
pnpm install
pnpm dev               # http://localhost:3000
pnpm seed              # sample posts + RAG knowledge
```

Tests: `pnpm test` (integration + e2e). See `docs/development.md`.

## Repo layout

- `src/payload.config.ts` — Payload config: collections, Postgres adapter, MCP plugin.
- `src/collections/` — collection configs (CMS: posts/media; Agent: agents/chat; Framework: users/roles/documents/providers).
- `src/lib/` — site data access, hybrid retriever/vector search, embeddings, LLM wiring, chat memory.
- `src/app/` — Next.js front-end (`(frontend)`) and Payload admin/API host (`(payload)`).
- `scripts/seed.ts` — sample content + RAG knowledge seed.
