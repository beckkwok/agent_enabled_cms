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

## Access-aware retrieval (implemented: design A + B)

**A. `Knowledge` carries visibility/ownership** (`src/collections/Knowledge.ts`):

| Field | Values | Meaning |
| --- | --- | --- |
| `visibility` | `public` \| `authenticated` \| `role` \| `private` | Who may read/retrieve the doc (default `authenticated`). |
| `owner` | → `users` | Used by `private`; set automatically on create. |
| `allowedRoles` | → `roles` (hasMany) | Used by `role`. |

`Knowledge.access` is visibility-aware (`src/collections/helpers/access.ts` → `knowledgeReadAccess`): Admins see everything; otherwise reads are constrained to `public`, `authenticated` (if logged in), `role` (if the user's role is in `allowedRoles`), or `private` (if `owner` = the user). Create = any authenticated principal; update/delete = Admin or owner.

**B. Retrieval is scoped by the access layer** (`src/lib/vectorSearch.ts`):
- `hybridSearch(payload, query, { user })` first resolves the caller's allowed Knowledge ids via `payload.find({ overrideAccess: false, user })` — i.e. it reuses the same access rules, no duplicated logic.
- If none are allowed it returns `[]`; otherwise both the FTS and vector SQL are constrained with `AND kc.knowledge_id IN (…)`.

Callers pass the acting identity:
- agent runs → the agent's `User` principal (`src/agents/run.ts`),
- `searchKnowledge` skill → the skill context user,
- blog `/api/ask` retriever → anonymous (so only `public` knowledge).

**Ingestion** is unchanged mechanically (`reindexKnowledge` still chunks/embeds on publish and writes chunks with `overrideAccess: true`), but chunks now only ever belong to a doc whose visibility the retrieval layer enforces.

### Trade-off / follow-up
- Resolving allowed ids per query is an extra query and materialises the id set; for very large corpora consider **option D** (denormalize the ACL onto each chunk) to filter in SQL directly.
- The visibility model is per-document; **role** uses `User.role` membership. Fine-grained role→permission modelling is tracked in `docs/v1-open-items.md` #11.

## History: why raw SQL needed scoping

Blog's `hybridSearch` ran **raw SQL** (`payload.db.execute`) with **no per-user filtering** — it returned any indexed chunk regardless of who asked, conflicting with the AACMS trust boundary. Design B fixes this by scoping the raw SQL to the id set the Payload access layer computed, so the access layer remains the single source of truth for "who can read what".
