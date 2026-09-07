# CMS ↔ Agent connectivity via Payload MCP

Design note on how agents reach the CMS while preserving the access-control trust boundary.

## Decision: keep Payload CMS MCP (no custom gateway)

Verified against https://payloadcms.com/docs/plugins/mcp (`@payloadcms/plugin-mcp`). Access control is fully defined, so no alternative integration path is needed.

## Two-layer authorization model

1. **Config-level enable.** A collection/global is opted in per operation in the Payload config:

   ```ts
   mcpPlugin({
     collections: {
       posts: { enabled: { find: true, create: true, update: true, delete: false } },
     },
   })
   ```

2. **API Key-level allow/disallow.** Payload adds an **MCP → API Keys** admin collection. Each key is associated with a Payload **user**, and an admin toggles per-collection / per-global / per-tool capabilities on that key in real time. Requests without a valid Bearer key are rejected.

Per the docs: access controls are enforced at the Payload level **using the user associated with the API key**, so existing collection access rules, hooks, and role restrictions all continue to apply.

## Fit with AACMS

- An **Agent user** (user type `Agent`, scoped role) is the natural key owner. A key issued for that agent inherits the agent's least-privilege rules.
- Custom skill tools (`mcp.tools`) receive `(args, req)`; use `req.payload` and pass `req` through to operations with `overrideAccess: false` and `user: req.user` so the key owner's rules still gate the call.
- `onEvent` → audit / conversation log (feeds evaluation + observability roadmap).
- `overrideResponse` → sanitize fields before the model sees them.
- Hooks can branch on `req.payloadAPI === 'MCP'`.

## Decision: agent API-key policy (recorded for implementation)

- **One API key per agent** — best flexibility and clean audit identity per agent (conversations/tool calls attributable to a single key owner).
- **Plus one default/fallback API key** — a generic key used when no specific agent key applies (e.g. unauthenticated admin-side operations, bootstrapping, or an operation not tied to a single agent).

Implementation notes to honor when building:
- Provision the per-agent key on the Agent record; bind it to the Agent user so the key inherits that agent's access rules.
- Treat the fallback key as a distinct, least-privilege key — never a superset of agent keys.
- Rotation/revocation must be possible per key from the admin (MCP → API Keys), and fallback key must be revocable independently.
