import { z } from 'zod'

import type { Skill } from './types'

/**
 * Saves a fact/preference to the agent's own long-term memory.
 *
 * The target agent is inferred from the acting principal (an `Agent` user), so
 * the agent can only write to its own memory. Admins may pass an explicit
 * `agent` id. The created record is owned by the target agent's principal, so
 * it stays readable by that agent regardless of who authored it.
 */
export const saveMemory: Skill = {
  name: 'saveMemory',
  description:
    'Save a short, non-sensitive fact or preference to long-term memory for use in future conversations. Do not store secrets, credentials, or personal data.',
  parameters: {
    content: z.string().describe('The fact or preference to remember.'),
    kind: z.enum(['fact', 'preference', 'summary']).optional().describe('Memory kind (default fact).'),
    agent: z.number().optional().describe('Target agent id (admins only; otherwise inferred).'),
  },
  handler: async (args, ctx) => {
    const content = String(args.content ?? '').trim()
    if (!content) return { error: 'content is required' }
    if (content.length > 2000) return { error: 'content is too long (max 2000 characters)' }

    const kind =
      args.kind === 'preference' || args.kind === 'summary' ? args.kind : 'fact'

    const user = ctx.user as { id?: number; type?: string } | null | undefined
    if (!user?.id) return { error: 'saveMemory requires an authenticated principal' }

    let agentId = typeof args.agent === 'number' ? (args.agent as number) : undefined
    if (agentId !== undefined && user.type !== 'Admin') {
      return { error: 'Only admins may specify an agent.' }
    }

    if (agentId === undefined) {
      const found = await ctx.payload.find({
        collection: 'agents',
        where: { user: { equals: user.id } },
        limit: 1,
        depth: 0,
        overrideAccess: false,
        user: ctx.user,
      })
      agentId = found.docs[0]?.id as number | undefined
      if (!agentId) return { error: 'No agent is bound to this principal.' }
    }

    // Own the memory by the target agent's principal so that agent can read it.
    const agentDoc = (await ctx.payload
      .findByID({ collection: 'agents', id: agentId, depth: 0, overrideAccess: false, user: ctx.user })
      .catch(() => null)) as { user?: number | null } | null
    const ownerId = agentDoc?.user ?? user.id

    const created = await ctx.payload.create({
      collection: 'agent-memories',
      data: { agent: agentId, owner: ownerId, kind, content },
      overrideAccess: false,
      user: ctx.user,
    })

    return { id: created.id, agent: agentId, kind, content }
  },
}
