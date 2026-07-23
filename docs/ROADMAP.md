# 로드맵

이 문서는 **아직 완료되지 않은 유지보수 작업만** 관리합니다. 완료 이력은 Git,
Release와 Actions run을 사용하고, 실행 계약은 `ARCHITECTURE`, `TEST_PLAN`,
`DEPLOYMENT`, `RELEASE_CHECKLIST`, `OPERATIONS`를 단일 원천으로 삼습니다.

## 모든 변경의 공통 승격 조건

1. 단일 책임의 작업 브랜치와 PR로 변경합니다.
2. 병합된 `main` SHA의 CI가 typecheck, lint, unit, RLS, preview E2E, remote E2E,
   build까지 모두 통과해야 합니다.
3. 운영 반영은 동일 SHA의 `Backup DB → DB Migrate → Deploy Worker` 순서를
   사용합니다.
4. `/version.json`의 SHA·lockfile hash·readiness manifest hash와
   root/CSP/nosniff healthcheck를 확인합니다.
5. 기존 migration은 수정·삭제·rename하지 않고 새 append-only migration으로만
   보정합니다.

구체적인 승인·증거 양식은 [RELEASE_CHECKLIST.md](./RELEASE_CHECKLIST.md)를
사용합니다.

## 유지보수 백로그

### 애플리케이션 구조

- `ChangeApplicationsPanel`을 task row 표현 → 순수 파생 model →
  history/controller 순서로 분리합니다.
- `ProjectsPanel`, `AnnouncementsPanel`, `ReviewRequestItem`의 화면 상태와 mutation
  조정을 controller hook으로 단계적으로 옮깁니다.
- `styles.css`는 cascade·computed-style·viewport 기준선을 먼저 고정한 뒤 영역별
  파일로 분리합니다.

### 운영·복구

- 폐기 가능한 별도 Supabase target에서 Auth UUID/FK/login을 포함한 full DR
  rehearsal을 정기 수행하고 비공개 증거를 보존합니다.
- `.gpg` backup의 복원 리허설과 운영자 전환이 완료되면 과도기 `.enc` 이중 산출을
  제거하는 별도 PR을 검토합니다.
- backup schedule heartbeat는 GitHub Actions 자체 실패 알림과 독립된 내부
  모니터링 수단으로 보완합니다.

### 보안·저장소

- 저장소를 Private으로 유지하고 공개 fork·외부 미러링을 금지합니다.
- GitHub Pro 이상으로 전환할 때 `main` PR·필수 `build` check·linear history
  ruleset을 재활성화하고 실제 차단 동작을 검증합니다.
- 분기별로 현재 tree와 전체 Git 이력의 credential·개인정보 노출을 재점검합니다.
- Node, Supabase CLI, Wrangler, Playwright와 GitHub Actions를 작은 PR로
  업그레이드하고 각 버전의 changelog·CI·RLS·E2E를 확인합니다.

## 항목별 완료 기준

- 호환 계약(URL hash, DOM/ARIA, 권한, RPC 인자, OCC, 감사 로그, no-op)을 보존
- 관련 단위·RLS·E2E 회귀 테스트 추가
- `git diff --check`
- `npm run typecheck`
- `npm run lint`
- `npm test -- --run`
- `npm run build`
- DB/RLS 관련 시 `npm run test:rls:full`과 `npm run test:e2e:remote`
- 사용자 경로 관련 시 `npm run test:e2e`

문서의 과거 통과 숫자보다 해당 후보 SHA의 실행 로그를 우선합니다.
