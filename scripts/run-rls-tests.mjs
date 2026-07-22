import { spawnSync } from 'node:child_process'

const result = spawnSync(
  process.execPath,
  ['node_modules/vitest/vitest.mjs', 'run', 'tests/rls', '--no-file-parallelism'],
  {
    stdio: 'inherit',
    env: { ...process.env, RLS_REQUIRED: '1' },
  },
)

if (result.error) throw result.error
process.exit(result.status ?? 1)
