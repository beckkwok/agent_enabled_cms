# Provider & model configuration

Design note on how model providers, API keys, and models are modeled so AACMS supports more than one provider (not bound to OpenAI).

## Two distinct "API key" concepts

Do not confuse them:

1. **CMS access key (MCP API key)** — who the agent *is* to the CMS. One per agent + one default/fallback. See `docs/mcp-connectivity.md`.
2. **Provider key** — the credential used to call a model/embedding provider (OpenAI, DeepSeek, Anthropic, local, etc.). Subject of this note.

## Decision: group provider + API key + model as a pair, modeled as a collection

A `Provider` collection models one model provider per document: provider type, the models it exposes, and a reference to the credential needed to call it. Agents reference a `Provider` (and a model on it) instead of hardcoding a vendor.

Why a paired grouping: a key is only meaningful *with* its provider — an OpenAI key against a DeepSeek endpoint fails. Modeling `Provider` (incl. its key reference) as one unit keeps that pairing explicit, makes multi-provider support natural, and keeps vendor specifics out of agent logic.

### Suggested shape (framework-level)

- **`Provider`** (Framework group)
  - `name` — display name (e.g. `openai-prod`, `deepseek`).
  - `provider` — type/select: `openai` | `deepseek` | `anthropic` | `local` | … (the SDK adapter to use).
  - `models` — list of available model ids (e.g. `text-embedding-3-small`, `gpt-4o`, `deepseek-chat`).
  - `keyRef` — **reference to a credential stored in env/secrets** (e.g. `OPENAI_API_KEY`). The collection stores the env var name / secret handle, not the secret. **Takes precedence** over a pasted key.
  - `apiKey` — **optional user-pasted key**, stored **encrypted at rest** (AES-256-CTR via `PAYLOAD_SECRET`; decrypt-on-read), so a user can paste a provider key in the admin UI without shell/secret-manager access. Admin-only field access.
  - `baseUrl` — optional base URL override for local/self-hosted providers.
  - `enabled` — flag.
- **`Agent`** references `Provider` + picks a `model` (chat/embedding) from it.
- Runtime adapter resolves the key via `resolveProviderApiKey()`: `keyRef` env var first, else the decrypted `apiKey`.

### Runtime resolution (implemented)

`src/lib/provider-runtime.ts` is the single place that turns a `Provider` record into SDK clients:

- `resolveProviderBaseUrl(provider)` — explicit `baseUrl` wins, else the per-type default (`deepseek` → `https://api.deepseek.com`, `anthropic` → `https://api.anthropic.com`, `openai`/`local` → SDK default; `local` requires `baseUrl`).
- `resolveProviderModel(provider, model?)` — explicit model wins, else the Provider's first model, else a clear error.
- `getChatModelForProvider(provider, opts)` — LangChain `ChatOpenAI` for OpenAI-compatible providers (openai/deepseek/local). **Anthropic chat is not wired yet** (needs `@langchain/anthropic`).
- `getEmbeddingClientForProvider(provider)` — OpenAI SDK client for OpenAI-compatible providers.
- Agent helpers: `getAgentProvider(agent)` and `getChatModelForAgent(agent)` build a model from an Agent's `provider` + `model`.

Callers:
- `src/lib/llm.ts` `getChatModel({ provider?, model?, temperature? })` — provider-aware; **falls back to env `DEEPSEEK_API_KEY`** when no provider is passed (keeps the blog `/api/ask` path working).
- `src/lib/embeddings.ts` `embedTexts(texts, { provider?, model? })` — provider-aware; falls back to env `OPENAI_API_KEY` (blog path). `MOCK_EMBEDDINGS=1` short-circuits both.
- The hardcoded `src/lib/deepseek.ts` client was removed (dead code superseded by the runtime).

> Agent runtime wiring (using `getChatModelForAgent` to actually *run* a configured agent) is roadmap step 3 — see `docs/v1-open-items.md`.

### Key handling & encryption

- **Resolution order** (`src/lib/provider-key.ts`): (1) `keyRef` → `process.env[keyRef]` if set/non-empty; (2) the pasted `apiKey` (already decrypted when read through Payload). Neither → clear configuration error.
- **Encryption at rest** reuses Payload's own mechanism (`payload.encrypt` / `payload.decrypt`): algorithm **AES-256-CTR**, random 16-byte IV prepended to the ciphertext, key = `sha256(PAYLOAD_SECRET).hex.slice(0,32)`. This is **symmetric/reversible** — anyone with the DB dump *and* `PAYLOAD_SECRET` can recover the key. That is the accepted trade-off for admin-pasted keys.
- **Access control:** the `apiKey` field is `read/create/update: isAdmin`. Agents/humans never see it. The MCP `providers` tool additionally redacts `apiKey` via `overrideResponse` (belt-and-braces), so an agent reading providers can't leak the credential.
- **Admin UX (masking):** the field uses a custom admin component (`src/components/admin/ApiKeyField.tsx`) that never displays the stored key — it shows a `••••••••` mask with a **Replace key** (password input) and **Clear** control. An untouched key is preserved on save; only an explicit replacement changes it. Note: because `afterRead` decrypts for Admin reads, the plaintext is present in the Admin browser's form state; masking is **presentational only**. True server-side masking (plaintext never reaches the browser) is tracked as an enhancement in `docs/v1-open-items.md` #10.

### Rules

- **Never store provider keys in plaintext.** Either `keyRef` (env/secret manager) or the encrypted `apiKey` field.
- **Never hardcode a vendor** in agent logic — always go through the `Provider` selection (matches the repo convention: model prompts/roles/config as PayloadCMS data).
- Embedding and chat may use *different* providers (embedding model from one `Provider`, reasoning model from another) — each is a normal `Provider` record.
- Tests must be provider-agnostic: inject a stub/mock provider (blog's `MOCK_EMBEDDINGS` pattern) so unit/e2e suites need no real keys (see `docs/development.md`).

## Open at implementation

- How per-deployment providers are seeded (env-driven seed script vs. admin UI at go-live).
- Whether pasted keys are per-deployment or per-tenant (multi-tenant).
- Anthropic adapter (`@langchain/anthropic`) — chat currently unsupported; embeddings N/A.
- Which Provider an Agent uses for *embeddings* when it has one Provider for chat (may need a separate embedding-provider reference or a framework default).
