# 로드맵

이 문서는 완료 이력이 아니라 현재 남아 있는 작업만 관리한다. 과거 변경 내역은 Git 기록을 사용하고, 실행 계약은 `ARCHITECTURE`, `TEST_PLAN`, `DEPLOYMENT`, `OPERATIONS`를 단일 원천으로 삼는다.

## 다음 배포 전 필수

1. 후보 변경을 의도한 파일만 검토하고 PR로 `main`에 병합한다.
2. 동일 `main` SHA의 CI가 typecheck, lint, unit, RLS, preview E2E, remote E2E, build까지 모두 통과했는지 확인한다.
3. 동일 SHA로 `Backup DB → DB Migrate → Deploy Worker`를 순서대로 실행한다.
4. 배포된 `/version.json`의 SHA·lockfile hash·readiness manifest hash와 root/CSP/nosniff healthcheck를 확인한다.
5. 운영 배포와 별도로, 폐기 가능한 원격 Supabase target에서 Auth UUID/FK/login을 포함한 full DR 리허설을 완료한다.

마이그레이션 파일 수와 설명은 자동 생성되는 [SUPABASE_MIGRATIONS.md](./SUPABASE_MIGRATIONS.md)를 사용한다. 기존 migration은 수정·삭제·rename하지 않고 새 append-only migration으로만 보정한다.

## 유지보수 백로그

- `ChangeApplicationsPanel`을 task row 표현 → 순수 파생 model → history/controller 순서로 분리한다.
- `ProjectsPanel`, `AnnouncementsPanel`, `ReviewRequestItem`의 화면 상태와 mutation 조정을 controller hook으로 단계적으로 옮긴다.
- `styles.css`는 cascade·computed-style·viewport 기준선을 먼저 고정한 뒤 영역별 파일로 분리한다.
- JS bundle 예산 여유가 작으므로 측정 결과를 기준으로 route-level lazy loading과 code splitting을 별도 PR에서 적용한다.
- GitHub `main` ruleset에서 동일 CI의 필수 check를 설정해 직접 push로 검증을 우회할 수 없게 한다.

각 항목은 URL hash, DOM/ARIA, 권한, RPC 인자, OCC, 감사 로그, no-op 동작을 바꾸지 않는 작은 PR로 처리한다.

## 공통 완료 기준

- `git diff --check`
- `npm run typecheck`
- `npm run lint`
- `npm test -- --run`
- `npm run test:rls:full` (skip 0)
- `npm run build`
- `npm run test:e2e`
- 필요 시 `npm run test:e2e:remote`

문서의 과거 통과 숫자보다 해당 후보 SHA의 실행 로그를 우선한다.
