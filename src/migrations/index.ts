import * as migration_20260908_212618 from './20260908_212618';
import * as migration_20260910_134718 from './20260910_134718';

export const migrations = [
  {
    up: migration_20260908_212618.up,
    down: migration_20260908_212618.down,
    name: '20260908_212618',
  },
  {
    up: migration_20260910_134718.up,
    down: migration_20260910_134718.down,
    name: '20260910_134718'
  },
];
