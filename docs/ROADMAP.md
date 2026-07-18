# 로드맵

## 2026-07-19 교정 리팩토링 상태

| 범위 | 상태 | 완료 증거 또는 차단 조건 |
|---|---|---|
| 안전 복구 | 완료 | `codex/refactor-bulk-snapshot`의 checkpoint와 clean integration worktree |
| P0 읽음/공지/PowerShell | 완료 | parity, comparator, fail-closed unit/workflow test |
| RLS runner/manifest/secret gate | 구현 완료, 실행 차단 | pinned CLI와 always-stop runner는 완료. 로컬 Docker Desktop 부재로 full RLS 성공 증거 없음 |
| repository/data/domain 분리 | 완료 | 필수 RepositoryContext, 단일 RepositorySet, named optional result, 순수 transition |
| 화면 controller/presentation 분리 | 완료 | WP-08~12 대상 화면과 App/Shell/Palette 분리 |
| 타입/빌더 | 완료 | feature별 Pick 입력과 변경신청/제품변경업무 builder |
| 경계 lint | 완료 | 실제 경로 기반 검사와 negative fixture |
| E2E | 완료(로컬) | leader/member, palette, review, project CRUD, product transfer, change, deep-link, density, sidebar, notification 10개 |
| 문서/파일 정리 | 진행 중 | 실제 구조 반영과 참조 0 파일만 삭제 |
| push/PR/배포 | 제외 | 별도 요청 전 수행하지 않음 |

## 완료 판정

전체 리팩토링은 아래가 모두 충족될 때만 완료로 표시한다.

1. `npm ci`, typecheck, lint, unit, build, bundle, diff check 성공
2. Playwright 10개 시나리오 skip 없이 성공
3. Docker 기반 `npm run test:rls:full` 성공, RLS skip 0
4. migration 56개와 readiness SQL manifest 검증 성공
5. production에 직접 적용하거나 push하지 않은 로컬 변경 범위가 명확함

현재 3번이 환경 차단 상태이므로 “코드 구현 완료”와 “전체 검증 완료”를 구분한다.

## 다음 승인 단위

1. Docker Desktop이 있는 환경에서 full RLS gate를 실행하고 결과를 기록한다.
2. integration branch를 검토한 뒤 사용자가 요청하는 경우에만 push와 PR을 만든다.
3. production release는 Backup DB -> DB Migrate -> Deploy Worker 순서를 유지한다.
4. 배포 후 leader/member 권한, 검토 읽음, 공지 정렬, 변경업무 처리, deep-link를 실제 URL에서 재검증한다.

## 후속 개선 후보

리팩토링 범위 밖의 기능 변경은 별도 계획과 PR로 분리한다. 기존 migration 재작성, 권한 완화, RPC 인자 변경, 감사 이력 삭제는 후속 개선으로도 허용하지 않는다.
