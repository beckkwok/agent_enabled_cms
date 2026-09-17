import type { Skill, SkillContext } from './types'

export type SkillAuthResult = { ok: true } | { ok: false; message: string }

type ActingUser = {
  type?: null | string
  role?: null | number | { name?: null | string }
}

/** Resolves the acting principal's role name(s), if any. */
async function roleNamesOf(ctx: SkillContext): Promise<string[]> {
  const role = (ctx.user as ActingUser | null | undefined)?.role
  if (!role) return []
  if (typeof role === 'object') return role.name ? [role.name] : []

  const found = await ctx.payload
    .findByID({ collection: 'roles', id: role, depth: 0, overrideAccess: true })
    .catch(() => null)
  return found?.name ? [found.name] : []
}

/**
 * Authorizes a skill call for the acting principal.
 *
 * - Admins always pass.
 * - `requiredUserTypes` — the user's `type` must match (when set).
 * - `requiredRoles` — the user's Role name must match (when set).
 * - No requirements → allowed for any principal.
 *
 * Enforcement is separate from data access: skills still run with
 * `overrideAccess: false` + `user`, so collection rules also apply.
 */
export async function authorizeSkill(skill: Skill, ctx: SkillContext): Promise<SkillAuthResult> {
  const user = ctx.user as ActingUser | null | undefined
  const hasRequirements = Boolean(skill.requiredUserTypes?.length || skill.requiredRoles?.length)

  if (!user) {
    return hasRequirements
      ? { ok: false, message: `Skill "${skill.name}" requires an authenticated principal.` }
      : { ok: true }
  }

  if (user.type === 'Admin') return { ok: true }

  if (skill.requiredUserTypes?.length && !skill.requiredUserTypes.includes(user.type ?? '')) {
    return {
      ok: false,
      message: `Skill "${skill.name}" requires user type: ${skill.requiredUserTypes.join(', ')}.`,
    }
  }

  if (skill.requiredRoles?.length) {
    const roles = await roleNamesOf(ctx)
    if (!roles.some((name) => skill.requiredRoles!.includes(name))) {
      return {
        ok: false,
        message: `Skill "${skill.name}" requires role: ${skill.requiredRoles.join(', ')}.`,
      }
    }
  }

  return { ok: true }
}

/**
 * Authorizes then runs a skill. On denial returns `{ error }` (does not call
 * the handler), so both the agent runtime and the MCP server can use it.
 */
export async function runSkill(
  skill: Skill,
  args: Record<string, unknown>,
  ctx: SkillContext,
): Promise<unknown> {
  const auth = await authorizeSkill(skill, ctx)
  if (!auth.ok) return { error: auth.message }
  return skill.handler(args, ctx)
}
