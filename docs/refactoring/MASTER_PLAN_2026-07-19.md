# SQA-P1-Workflow 교정 리팩토링 마스터 계획

이 문서는 2026-07-19 승인된 교정 리팩토링의 authoritative plan이다. 기존 [`../REFACTORING_PLAN.md`](../REFACTORING_PLAN.md)는 2026-07-17 실행 기록으로 보존한다.

## 불변 원칙

1. 기존 기능, UI, 권한, RLS, RPC, 감사, 배포 계약을 보존한다.
2. review read-state parity와 announcement sort 회귀만 의도된 동작 수정으로 허용한다.
3. 하나의 WP만 하나의 commit과 미래 PR에 대응시킨다.
4. 기존 migration은 수정, 삭제, rename하지 않는다.
5. RLS가 skip 또는 실패하면 해당 WP와 전체 리팩토링을 완료로 표시하지 않는다.
6. 삭제는 대체 위치, 참조 0, 복구 방법이 증명된 경우만 허용한다.

## 실행 순서

1. WP-00: 기준선, 실행 기록, PR evidence template
2. WP-01: local/remote review read-state parity
3. WP-02: announcement canonical sort와 empty AppData
4. OPS-RLS/PS/MANIFEST/SECRET: 공용 RLS gate, native fail-closed, canonical SQL, secret scope
5. WP-03~07: RepositorySet, Team/Activity, Master adapter, fetch pipeline, change transitions
6. WP-08~13: 주요 화면 controller/presentation 분리와 좁은 AppData 타입
7. WP-15A~C: dependency boundary, 10개 E2E, 문서 종결
8. CLEAN-01: 대체가 증명된 파일만 삭제

## 완료 지표

- composition root 밖 `ctx.isRemote`: 0
- mutation facade의 직접 Supabase import: 0
- repository contract의 React import: 0
- `src/lib`의 DB write: 0
- announcement sort, empty AppData, RLS runner, SQL manifest: 각각 authoritative source 1개
- optional query positional index 접근: 0
- 주요 화면 component test와 필수 10개 E2E 존재
- typecheck, lint, unit, RLS, E2E, build, bundle, diff check 모두 pass

## 공통 증거

모든 WP는 `npm ci`, typecheck, lint, 전체 unit test, build, bundle budget, `git diff --check` 결과를 남긴다. Repository/DB/ops WP는 full RLS, UI WP는 component/E2E 증거를 추가한다. 롤백은 파일 일부가 아니라 해당 WP commit 전체를 revert한다.
