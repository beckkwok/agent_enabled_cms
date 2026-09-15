# Retrieval: hybrid vector search

Design note on how RAG retrieval works in AACMS.

## Decision: reuse the blog RRF hybrid search (not LangChain's default vector store)

LangChain's default vector store is single-method (plain cosine similarity over pgvector). It has no built-in keyword/hybrid fusion. The blog project (`https://github.com/beckkwok/blog`) already implements a superior hybrid and wraps it as a LangChain `BaseRetriever`, so adopting it costs nothing in LangChain compatibility.

Verified source (blog repo): `src/lib/vectorSearch.ts`, `src/lib/retriever.ts`.

### Algorithm (from blog, to carry into AACMS)

- **Semantic arm**: pgvector cosine (`<=>`), HNSW cosine index, over chunk embeddings.
- **Keyword arm**: Postgres full-text search (`search_tsv` tsvector column) ranked by `ts_rank`.
- **Fusion**: Reciprocal Rank Fusion (`RRF_K = 60`), per-arm weight, `minSimilarity` floor, `limit`.
- Exposed to LangChain as `HybridSearchRetriever extends BaseRetriever` → drops into any LangChain.js chain/agent.

## Fit with AACMS (framework code, generalized)

Blog hardcodes concerns that must become framework/generalized code in AACMS:

- Embedding model `text-embedding-3-small` (1536-dim) and FTS `'english'` config → store per deployment/config, not hardcoded (vector *dimension* remains compile-time schema; model choice is data).
- Table `knowledge_chunks` hardwired → model chunks under the framework `Document` (indexed for RAG) group.
- Embedding model choice, chunking params, retriever weights (`{keyword, vector}`, `limit`) → CMS-configurable.

## Current design: ingestion & access (as implemented)

This is the state today, for reference while designing access-aware RAG.

**Ingestion path** (`Knowledge` → `reindexKnowledge` hook → `KnowledgeChunk`):

1. **Create/update `Knowledge` doc** — gated by `privateCollectionAccess`: any **authenticated** user may create/read/update/delete. There is **no owner, role, tenant or visibility field** on `Knowledge`, so all authenticated users see the same corpus.
2. **`afterChange` hook (`reindexKnowledge`)** — on publish, it deletes existing chunks, chunks `content` (`chunkText`), embeds them (`embedTexts`), and creates one `KnowledgeChunk` row per chunk **with `overrideAccess: true`** (system-generated child rows), then writes the `embedding` + `search_tsv` via **raw SQL**.
3. **Chunks carry no access metadata** — `KnowledgeChunk` has `knowledge`, `chunkIndex`, `content`, `embeddingModel` only. There is no per-chunk/per-doc visibility to filter on.
4. **Retrieval (`hybridSearch`)** — raw SQL over `knowledge_chunks` (FTS + pgvector, RRF). **No `where`, no user filter.** Every indexed chunk is retrievable by any caller.

**Net effect:** *ingestion* is gated only by "must be authenticated" (no ownership/visibility), and *retrieval* is gated by **nothing**. So access control does not currently apply to RAG at all.

## Open design item: RAG × access control

Blog's `hybridSearch` runs **raw SQL** (`payload.db.execute`) with **no per-user filtering** — it returns any indexed chunk regardless of who asks. This conflicts with the AACMS trust boundary ("only valid users/agents reach the corresponding information").

Candidates to resolve at implementation:

1. Constrain the candidate set first via Payload `where` (respecting the caller's access rules), then run hybrid over the allowed docs/chunks.
2. Gate retrieval to an admin-scoped context (retrieval only runs under an admin/agent with explicit read rights over `Document`).
3. If per-user filtering over large corpora is required, scope FTS+vector SQL by the same allowed-`knowledge_id` set the access layer computed.

### Design options under consideration (for scoped/private corpora)

- **A. Add visibility/ownership to `Knowledge`** — e.g. `owner` (user), `visibility` (`public`/`role`/`private`), or `allowedRoles`. `Knowledge.access.read` then returns a `where` clause; retrieval must apply the same scope.
- **B. Enforce at retrieval time** — before the SQL search, resolve the caller's allowed `knowledge` ids via Payload (`overrideAccess: false`, `user`), then add `AND kc.knowledge_id = ANY(allowed)` to both the FTS and vector queries. Keeps raw SQL but scopes it to the access layer's decision.
- **C. Trusted-only retrieval** — keep retrieval admin/agent-scoped (option 2 above) and treat Knowledge as an internal corpus only; no end-user retrieval.
- **D. Per-chunk denormalized ACL** — copy the parent doc's visibility onto each chunk so the SQL filter is a simple column check (fast at scale; requires re-sync on visibility change).

Trade-off to settle first: **where the source of truth for visibility lives** (on `Knowledge`, on the caller's role, or both) — that decides whether B/C/D can reuse Payload access rules or need their own model.

Until resolved, retrieval must never return documents the requesting agent/user could not read via the normal Payload access layer.
