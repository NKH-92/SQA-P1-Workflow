# CAPA remediation baseline evidence

Recorded before Work Package 1 changes on 2026-07-19 KST.

## Source baseline

| Item | Evidence |
|---|---|
| Plan baseline SHA | `7f0bff68d8bf105da7625a26e924d9c31c8a831d` |
| Local `main` HEAD | `7f0bff68d8bf105da7625a26e924d9c31c8a831d` |
| `origin/main` | `7f0bff68d8bf105da7625a26e924d9c31c8a831d` |
| Ahead / behind | `0 / 0` |
| Worktree before validation | clean |
| Node.js | `v24.16.0` |
| npm | `11.13.0` |
| Supabase CLI | `2.109.1` through `npx supabase` |
| Docker | unavailable on this workstation |

`git fetch --prune` initially found a stale local fetch ref for the already removed
`codex/review-workflow-hardening-stage-b` remote branch. The obsolete repository-local
fetch rule was removed, after which `origin/main` fetched normally. No source file was
changed by that repair.

## Local validation

| Command | Result |
|---|---|
| `npm ci` | PASS — 281 packages added, 282 audited, 0 vulnerabilities |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm test -- --run` | PASS — 84 files / 444 tests passed; 7 files / 44 tests skipped |
| `npm run build` | PASS — 2 JS chunks, 175,604 gzip bytes; bundle budget OK |
| `git diff --check` | PASS |

The 7 skipped files and 44 skipped tests are the local Supabase RLS suites. They require
the deterministic Supabase fixture, but Docker is not installed on this workstation.
The CI `rls` job remains mandatory and reproduces the repository's Stage B handoff:
hold Stage B migrations, start Supabase, purge the disposable attachment bucket through
the Storage API, restore/apply Stage B and later migrations, seed fixtures, and run
`npm run test:rls`.

## GitHub CI state

The most recent CI run for the baseline SHA was run
[`29647041831`](https://github.com/NKH-92/SQA-P1-Workflow/actions/runs/29647041831).
All four independent jobs (`typecheck`, `lint`, `test`, `rls`) failed before any step was
created; the build job was consequently skipped and GitHub provided no job log. This is
classified as runner/provisioning failure rather than application-code failure. The same
run was re-requested for the unchanged SHA as required by the remediation plan. Until a
runner executes it successfully, this baseline and subsequent feature work must not be
labelled production-ready. The rerun completed at 2026-07-19 00:31 KST with the same
four jobs failing with empty step lists, so no application failure log exists.
