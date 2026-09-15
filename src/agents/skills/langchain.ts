import { tool, type StructuredToolInterface } from '@langchain/core/tools'
import { z } from 'zod'

import { getSkill } from './index'
import type { SkillContext } from './types'

/**
 * Builds LangChain tools for the given skill names, bound to the run's
 * context (payload + acting user) so skill calls are access-controlled.
 * Unknown skill names are ignored.
 */
export function buildAgentTools(
  toolNames: string[],
  ctx: SkillContext,
): StructuredToolInterface[] {
  const tools: StructuredToolInterface[] = []

  for (const name of toolNames) {
    const skill = getSkill(name)
    if (!skill) continue

    tools.push(
      tool(
        async (args: Record<string, unknown>) =>
          JSON.stringify(await skill.handler(args, ctx)),
        {
          name: skill.name,
          description: skill.description,
          schema: z.object(skill.parameters),
        },
      ) as StructuredToolInterface,
    )
  }

  return tools
}
