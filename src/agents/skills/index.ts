import type { Skill } from './types'

import { countContent } from './countContent'
import { getContent } from './getContent'
import { listContent } from './listContent'
import { searchKnowledge } from './searchKnowledge'
import { saveMemory } from './saveMemory'

/**
 * Framework skill registry. Each skill is exposed both as an agent tool
 * (LangChain, during a run) and as an MCP custom tool (external clients).
 * Application projects register their own skills here (or extend this map).
 */
export const SKILLS: Record<string, Skill> = {
  [searchKnowledge.name]: searchKnowledge,
  [listContent.name]: listContent,
  [getContent.name]: getContent,
  [countContent.name]: countContent,
  [saveMemory.name]: saveMemory,
}

export const SKILL_NAMES = Object.keys(SKILLS)

export function getSkill(name: string): Skill | undefined {
  return SKILLS[name]
}

export type { Skill, SkillContext } from './types'
