# Large-document ingestion for RAG (Design B reference)

Reference for **application developers** who must index very large corporate documents (e.g. 1000+ page PDFs, scanned archives, regulatory packs) and ground agents on them with provenance.

This is the flexible option (Design B). The framework ships the **quick baseline** (Design A: file upload + text extraction + batched embedding + queue reindex on the `Knowledge` collection). Read this before extending beyond that baseline.

> Contract reminder (`docs/building-applications.md`): build **on top of** the framework. Add app collections/queues/extractors; do not modify framework-owned schema (`Knowledge`, `KnowledgeChunk`, `Agent`, `User`, `Provider`, hybrid retriever). The framework gives you: Payload queue, `Provider` model config, the RRF `HybridSearchRetriever`, and the access-control layer.

## Problem statement

Design A indexes a document as one text blob → overlapping chunks → vectors. For very large documents it falls short on:

- **Scale**: 10k–50k chunks per doc → rate limits, long-running jobs.
- **Fidelity**: scanned/structured PDFs need OCR and layout-aware extraction; a naive text dump loses tables and order.
- **Provenance**: answers should cite a page/section, not just a chunk id.
- **Operability**: admins need to see per-run progress, failures, retries — not a single `status` field.
- **Access control**: app documents often carry visibility rules the retriever must honour (#6 open item in `docs/retrieval.md`).

## Reference architecture (app layer)

```
Upload (file field) ──► Document ──► Queue: reindex job
                                       ├─ Extract   (per sourceType: pdf/docx/html/txt/scanned-OCR)
                                       ├─ Chunk     (structure-aware, keeps page/section markers)
                                       ├─ Embed     (batched, Provider-driven)
                                       └─ Store     (chunks + vectors + provenance)
                                       → IngestionRun (progress, counts, timings, errors)
                                                        │
                                        retriever ←── honours Document visibility (access control)
```

## App collections (add to your app, not the framework)

- **`Document`** (or your domain name, e.g. `RegulatoryPack`): `file` (Payload upload), `sourceType` select (`pdf`/`docx`/`html`/`md`/`txt`/`url`), `visibility`/access rules, lifecycle `status`. Framework-owned `Knowledge` stays for simple text knowledge; use this for large/corporate docs.
- **`IngestionRun`**: one row per indexing attempt — `document`, `status` (`queued`/`extracting`/`chunking`/`embedding`/`indexed`/`failed`), `chunkCount`, `startedAt`/`completedAt`, `error`, `logs`. This is your audit/history surface (feeds the evaluation/observability roadmap).
- **`Chunk`** (app-owned): like `KnowledgeChunk` but adds `pageNumber`/`section` provenance and a `document` + `ingestionRun` reference.

## Pipeline stages

1. **Extraction** — resolver by `sourceType`:
   - Text PDF → `pdf-parse`-class library.
   - Scanned PDF → OCR pass (e.g. tesseract) — flag expected cost/time.
   - DOCX/HTML → document-specific parsers; keep heading structure.
   - URL → fetch + readability extraction.
   - Emit text **per page/section** so later stages can attach provenance.
2. **Chunking** — reuse the framework chunker semantics (size + overlap + boundary snap) but operate per page/section and record the source span. Consider heading-aware boundaries for structured docs.
3. **Embedding (batched)** — never send all chunks in one call. Batch by a Provider-configurable size (e.g. 100–500/request), limited concurrency, retry with backoff on 429/5xx. Resolve model + key via the `Provider` collection (`docs/provider-model.md`) — not env constants.
4. **Storage** — write chunks via Payload (respect the framework rule; only LangChain-infra vector columns, if any, use the documented carve-out per `docs/v1-open-items.md` #2).
5. **Queue orchestration** — one Payload queue task per document; run extract→chunk→embed→store as ordered work items with retries; update `IngestionRun` between stages. Enqueue on document publish/upload, never inline in the save hook (a 1000+ page doc would hang the request).
6. **Admin UX** — an admin view listing `IngestionRun`s (progress, counts, errors) and per-`Document` status.

## Retrieval integration

- Wrap your app chunks so the framework `HybridSearchRetriever` can return them with provenance in `metadata` (page/section/document id).
- **Access control (#6):** constrain the candidate set to `Document`s the caller may read (via Payload `where`) before running hybrid search, or gate retrieval to admin-scoped contexts. Never return chunks from docs the agent/user cannot read.
- If you need per-page citation in the answer, pass `pageNumber` through retrieved metadata into the prompt context.

## Provider & config

- Embedding model, batch size, retries, and concurrency should be **data** (Provider record + per-app ingestion settings), not constants — consistent with `docs/provider-model.md`.
- Keep provider keys as env/secret references; never store keys in collections.

## Cost/benefit vs Design A

| | Design A (framework) | Design B (app reference) |
| --- | --- | --- |
| Use case | Basic RAG on pasted/simple text files | Large corporate/scanned/structured documents |
| Scale | Small–medium docs | 1000+ page, 10k+ chunks |
| Provenance | Chunk id only | Page/section citation |
| Observability | Status field | Per-run history + progress |
| Effort | Framework-shipped | App-built, more moving parts |

## Suggested build order (when you build an app needing B)

1. Decide the RAG × access-control model first (`docs/retrieval.md` #6) — it shapes `Document` visibility.
2. Scaffold app collections (`Document`, `IngestionRun`, app `Chunk`) + migrations.
3. Extractors for the source types you actually ship (start with text PDF + TXT; add OCR/DOCX later).
4. Queue reindex task with `IngestionRun` updates.
5. Batched, Provider-driven embedding.
6. Retriever integration with provenance + visibility filter; e2e tests per `docs/development.md` (agent ↔ CMS path).
