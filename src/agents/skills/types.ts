import type { Payload, TypedUser } from 'payload'
import type { z } from 'zod'

/**
 * Context a skill runs in. The same skill implementation is used by both:
 *   - the agent runtime (tool calling), acting as the agent's principal, and
 *   - the MCP server (custom tools), acting as the API-key owner.
 *
 * Skills MUST pass `overrideAccess: false` + `user` to Payload so the
 * caller's access rules are enforced (never bypass the trust boundary).
 */
export type SkillContext = {
  payload: Payload
  user?: null | TypedUser
}

export type Skill = {
  /** Stable skill name (also the MCP tool name and Agent.tools value). */
  name: string
  description: string
  /** Zod raw shape for the skill arguments. */
  parameters: z.ZodRawShape
  /**
   * Optional authorization: the acting principal's user type must be one of
   * these (e.g. `['Admin']`). Admins always pass. Omit for "any principal".
   */
  requiredUserTypes?: string[]
  /**
   * Optional authorization: the acting principal's Role name must be one of
   * these. Admins always pass. Omit for "any role".
   */
  requiredRoles?: string[]
  handler: (args: Record<string, unknown>, ctx: SkillContext) => Promise<unknown>
}
