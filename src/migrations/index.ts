import * as migration_20260908_212618 from './20260908_212618';
import * as migration_20260910_134718 from './20260910_134718';
import * as migration_20260911_125121 from './20260911_125121';
import * as migration_20260915_142601 from './20260915_142601';
import * as migration_20260915_171308 from './20260915_171308';
import * as migration_20260916_033923 from './20260916_033923';
import * as migration_20260916_163015 from './20260916_163015';
import * as migration_20260916_165824 from './20260916_165824';
import * as migration_20260916_171922 from './20260916_171922';
import * as migration_20260916_180000_default_guardrails from './20260916_180000_default_guardrails';
import * as migration_20260919_000000_agent_memory from './20260919_000000_agent_memory';
import * as migration_20260919_010000_role_permissions from './20260919_010000_role_permissions';
import * as migration_20260919_020000_evaluation from './20260919_020000_evaluation';
import * as migration_20260919_030000_eval_gate from './20260919_030000_eval_gate';

export const migrations = [
  {
    up: migration_20260908_212618.up,
    down: migration_20260908_212618.down,
    name: '20260908_212618',
  },
  {
    up: migration_20260910_134718.up,
    down: migration_20260910_134718.down,
    name: '20260910_134718',
  },
  {
    up: migration_20260911_125121.up,
    down: migration_20260911_125121.down,
    name: '20260911_125121',
  },
  {
    up: migration_20260915_142601.up,
    down: migration_20260915_142601.down,
    name: '20260915_142601',
  },
  {
    up: migration_20260915_171308.up,
    down: migration_20260915_171308.down,
    name: '20260915_171308',
  },
  {
    up: migration_20260916_033923.up,
    down: migration_20260916_033923.down,
    name: '20260916_033923',
  },
  {
    up: migration_20260916_163015.up,
    down: migration_20260916_163015.down,
    name: '20260916_163015',
  },
  {
    up: migration_20260916_165824.up,
    down: migration_20260916_165824.down,
    name: '20260916_165824',
  },
  {
    up: migration_20260916_171922.up,
    down: migration_20260916_171922.down,
    name: '20260916_171922'
  },
  {
    up: migration_20260916_180000_default_guardrails.up,
    down: migration_20260916_180000_default_guardrails.down,
    name: '20260916_180000_default_guardrails'
  },
  {
    up: migration_20260919_000000_agent_memory.up,
    down: migration_20260919_000000_agent_memory.down,
    name: '20260919_000000_agent_memory'
  },
  {
    up: migration_20260919_010000_role_permissions.up,
    down: migration_20260919_010000_role_permissions.down,
    name: '20260919_010000_role_permissions'
  },
  {
    up: migration_20260919_020000_evaluation.up,
    down: migration_20260919_020000_evaluation.down,
    name: '20260919_020000_evaluation'
  },
  {
    up: migration_20260919_030000_eval_gate.up,
    down: migration_20260919_030000_eval_gate.down,
    name: '20260919_030000_eval_gate'
  },
];
