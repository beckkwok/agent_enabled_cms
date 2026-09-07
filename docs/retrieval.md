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

## Open design item: RAG × access control

Blog's `hybridSearch` runs **raw SQL** (`payload.db.execute`) with **no per-user filtering** — it returns any indexed chunk regardless of who asks. This conflicts with the AACMS trust boundary ("only valid users/agents reach the corresponding information").

Candidates to resolve at implementation:

1. Constrain the candidate set first via Payload `where` (respecting the caller's access rules), then run hybrid over the allowed docs/chunks.
2. Gate retrieval to an admin-scoped context (retrieval only runs under an admin/agent with explicit read rights over `Document`).
3. If per-user filtering over large corpora is required, scope FTS+vector SQL by the same allowed-`knowledge_id` set the access layer computed.

Until resolved, retrieval must never return documents the requesting agent/user could not read via the normal Payload access layer.
