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
  - `keyRef` — **reference to a credential stored in env/secrets, never in the DB** (e.g. `OPENAI_API_KEY`, `DEEPSEEK_API_KEY`). The collection stores the env var name / secret handle, not the secret.
  - `enabled` — flag.
- **`Agent`** references `Provider` + picks a `model` (chat/embedding) from it.
- Runtime adapter resolves `keyRef` → env at call time.

### Rules

- **Never store provider keys in collection fields.** The `Provider` doc holds a reference/env name only.
- **Never hardcode a vendor** in agent logic — always go through the `Provider` selection (matches the repo convention: model prompts/roles/config as PayloadCMS data).
- Embedding and chat may use *different* providers (embedding model from one `Provider`, reasoning model from another) — each is a normal `Provider` record.
- Tests must be provider-agnostic: inject a stub/mock provider (blog's `MOCK_EMBEDDINGS` pattern) so unit/e2e suites need no real keys (see `docs/development.md`).

## Open at implementation

- Whether `Provider` needs a per-record base URL for local/self-hosted models (e.g. Ollama) — likely yes as an optional field.
- How per-deployment providers are seeded (env-driven seed script vs. admin UI at go-live).
