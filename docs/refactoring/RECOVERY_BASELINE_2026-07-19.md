# Recovery baseline — 2026-07-19

## 혼합 작업 보존

- 원래 작업트리: `E:\Codex project\SQA-P1-Workflow`
- 기준 commit: `e6ce717648f4c82cd70c85a4f7bd7510c9a114e3`
- 보존 브랜치: `codex/refactor-bulk-snapshot`
- 보존 commit: `7b3702d`
- 확장 경로 기준 변경: 102개
  - modified: 60
  - deleted: 12
  - untracked/new: 30

보존 commit은 복구 전용이다. 병합하거나 통째로 cherry-pick하지 않고, 승인된 변경만 WP별로 재적용한다.

## Integration 작업공간

- worktree: `E:\Codex project\SQA-P1-Workflow-refactor-v2`
- branch: `codex/refactor-integration`
- start commit: `e6ce717648f4c82cd70c85a4f7bd7510c9a114e3`

각 WP는 단일 commit으로 남기며 관련 없는 파일을 stage하지 않는다. 원격 push, PR 생성, DB 적용, Worker 배포는 현재 범위에 포함하지 않는다.
