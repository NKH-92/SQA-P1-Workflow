# WP1 authoritative audit integrity v3 evidence

## 기준

- Base SHA: `7f0bff68d8bf105da7625a26e924d9c31c8a831d`
- Branch: `codex/remediate-audit-integrity-v3`
- Head SHA: feature branch commit and PR metadata are the publication record
- Baseline CI: run `29647041831`, including rerun, failed before every job's first step

## 해결한 리뷰 항목

- F-01: INSERT/DELETE가 ID만 남기던 v2 감사 lifecycle을 business snapshot으로 확장
- 엔터티별 allowlist와 unknown-entity fail-closed 계약 추가
- UPDATE는 `updated_at` noise를 제외한 실제 업무 변경만 유지
- UI에 생성/삭제 snapshot, 수정 전후 값, legacy 안내, safe wrapping 추가
- migration/deploy/local readiness를 v3 migration, helper ACL, 16개 trigger, list RPC ACL로 강화

## 신규 migration

- `20260718153410_authoritative_audit_lifecycle_snapshots.sql`
- 기존 migration과 과거 v2 audit row는 수정하지 않음
- 브라우저 역할은 private helper/table에 접근할 수 없음
- v2 DB + 신규 UI, v3 DB + 기존 UI 양쪽 배포 공백에서 기존 list RPC shape를 유지

## 검증

| Command | Result |
|---|---|
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| targeted WP1 tests | PASS — 4 files / 75 tests; RLS file 1개 / 2 tests는 local env 부재로 skipped |
| `npm test -- --run` | PASS — 85 files / 448 tests; 8 files / 46 RLS tests skipped |
| `npm run build` | PASS — bundle budget OK, 176,026 gzip bytes |
| `git diff --check` | PASS |
| `npm run test:rls` | ENVIRONMENT BLOCKED — Docker/local Supabase가 없어 8 suites가 fail-closed |

`npm run test:rls`는 테스트 완화나 skip이 아니라 `RLS_REQUIRED=1`의 의도된 환경
차단으로 실패했다. DB PR 완료 조건은 GitHub runner가 실제 step을 시작하고 새
`rls.audit-lifecycle.test.ts` 및 audit readiness SQL을 통과하는 것이다.

## 운영자 수동작업

운영 반영은 이 문서의 로컬 증적과 연결된 feature PR에서 추적한다. 순서는 CI green →
merge SHA CI green → Backup DB → DB Migrate → readiness → Deploy Worker → leader 감사 화면
smoke이며, GitHub runner provisioning 실패가 해소되기 전에는 production-ready로 표시하지
않는다.

## 남은 위험

- 실제 Postgres migration replay와 RLS lifecycle test는 로컬 Docker 부재 및 GitHub runner
  provisioning 실패 때문에 아직 실행 증적이 없다.
- WP2 이후 패키지는 계획서의 직렬 merge gate에 따라 WP1 merge SHA green 이후 착수한다.
