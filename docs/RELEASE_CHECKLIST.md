# 운영 릴리스 체크리스트

이 문서는 이미 구축된 운영 환경에 변경을 반복 배포할 때 사용하는 승인·증거
체크리스트입니다. 최초 Supabase·Cloudflare 구성은 [DEPLOYMENT.md](./DEPLOYMENT.md),
장애·복구·계정 관리는 [OPERATIONS.md](./OPERATIONS.md)를 따릅니다.

## 릴리스 원칙

- 작업 브랜치 → PR → squash merge 순서를 지킵니다.
- `main` 직접 push, force push, migration 수정·삭제·rename을 금지합니다.
- 운영 DB와 Worker는 자동 배포하지 않고 승인된 `workflow_dispatch`로만 승격합니다.
- CI, backup, migration, deploy는 **같은 전체 SHA**를 사용합니다.
- 어느 단계든 실패·skip·SHA 불일치가 있으면 다음 단계로 진행하지 않습니다.
- 운영 URL, project ref, credential, 사용자 실값은 이 문서나 PR에 기록하지 않습니다.

## 1. 후보 변경 확인

| 확인 | 완료 |
|---|:---:|
| 변경 목적과 비목표가 PR 한 개의 책임으로 설명됨 | [ ] |
| `git status`와 diff에서 의도한 파일만 변경됨 | [ ] |
| `.env*`, DB dump, 사용자 목록, 운영 URL·ID·key가 포함되지 않음 | [ ] |
| 기존 migration의 수정·삭제·rename이 없고 필요한 변경은 새 migration임 | [ ] |
| UI/DOM/ARIA/hash/RPC/RLS/audit 호환성 영향이 PR에 기록됨 | [ ] |
| rollback 또는 roll-forward 방법이 PR에 기록됨 | [ ] |

기록:

| 항목 | 값 |
|---|---|
| 후보 브랜치 | `<BRANCH>` |
| 후보 SHA | `<FULL_SHA>` |
| PR | `<PR_NUMBER_OR_URL>` |
| 변경 책임 | `<ONE_SENTENCE_SCOPE>` |

## 2. 로컬 검증

일반 변경:

```bash
npm ci
npm run typecheck
npm run lint
npm test -- --run
npm run build
npm run test:e2e
git diff --check
```

DB·RLS·repository·workflow·배포 계약 변경은 추가로 실행합니다.

```bash
npm run test:rls:full
npm run test:e2e:remote
```

| 게이트 | 결과 |
|---|---|
| typecheck | [ ] PASS |
| lint·dependency boundary·CSS·migration drift | [ ] PASS |
| Vitest | [ ] PASS |
| production build·bundle budget | [ ] PASS |
| Preview Playwright 17개 | [ ] PASS |
| Full RLS(skip 0, 해당 변경 시 필수) | [ ] PASS / [ ] 해당 없음 |
| Remote E2E 12개(해당 변경 시 필수) | [ ] PASS / [ ] 해당 없음 |
| `git diff --check` | [ ] PASS |

## 3. PR과 CI

1. 작업 브랜치를 push하고 PR을 엽니다.
2. 변경 파일, 검증 증거, 위험과 rollback을 확인합니다.
3. PR의 모든 review thread를 해결합니다.
4. `build` check가 성공할 때까지 병합하지 않습니다. 현재 Private 저장소에서는
   요금제 제한으로 required check를 서버 강제하지 못하므로 운영자가 반드시 직접
   확인합니다. `build`는 typecheck, lint, unit, RLS, preview E2E, remote E2E
   성공에 의존합니다.
5. squash merge 후 원격 작업 브랜치가 자동 삭제됐는지 확인합니다.

| 확인 | 값 |
|---|---|
| PR CI run ID | `<CI_RUN_ID>` |
| PR CI SHA | `<FULL_SHA>` |
| 모든 job 성공·skip 없음 | [ ] |
| squash merge 완료 | [ ] |
| 병합된 `main` 전체 SHA | `<MAIN_FULL_SHA>` |
| 작업 브랜치 자동 삭제 | [ ] |

PR 후보 SHA와 squash merge SHA는 다를 수 있습니다. 이후 운영 승격에는 **병합된
`main` SHA의 push CI run**을 사용합니다.

## 4. 운영 Backup DB

1. 병합된 `main` SHA의 push CI가 전체 성공했는지 확인합니다.
2. Actions → **Backup DB**를 `main`에서 실행합니다.
3. 암호화·복호화 재검증·평문 제거가 모두 성공했는지 Job Summary에서 확인합니다.
4. 암호화 Artifact의 보존 기간이 90일인지 확인합니다.

| 확인 | 값 |
|---|---|
| `main` push CI run ID | `<MAIN_CI_RUN_ID>` |
| `main` SHA | `<MAIN_FULL_SHA>` |
| Backup run ID | `<BACKUP_RUN_ID>` |
| Backup 결론 | [ ] `Backup OK` |
| `.gpg` artifact 생성·90일 보존 | [ ] |
| 평문 dump 미업로드 | [ ] |

## 5. DB Migrate

DB 변경이 없어도 같은 SHA의 migration history와 readiness를 증명하기 위해 실행합니다.

1. Actions → **DB Migrate**를 `main`에서 실행합니다.
2. 입력에 같은 SHA의 성공한 `main` CI run ID와 24시간 이내 Backup run ID를
   입력합니다.
3. migration history exact set, Stage B handoff guard, canonical readiness가 모두
   성공했는지 확인합니다.

| 확인 | 값 |
|---|---|
| DB Migrate run ID | `<DB_MIGRATE_RUN_ID>` |
| 대상 SHA | `<MAIN_FULL_SHA>` |
| CI·Backup provenance | [ ] 일치 |
| migration history exact set | [ ] PASS |
| canonical readiness | [ ] PASS |
| 실패·부분 적용·skip | [ ] 없음 |

## 6. Deploy Worker

1. Actions → **Deploy Worker**를 `main`에서 실행합니다.
2. `deploy_confirm=true`, 같은 SHA의 CI run ID와 24시간 이내 DB Migrate run ID를
   입력합니다.
3. provenance guard, RLS, 정적 검사, unit, deploy config, 운영 readiness, build,
   Worker deploy, live provenance, healthcheck가 모두 성공했는지 확인합니다.

| 확인 | 값 |
|---|---|
| Deploy run ID | `<DEPLOY_RUN_ID>` |
| 대상 SHA | `<MAIN_FULL_SHA>` |
| CI·DB Migrate provenance | [ ] 일치 |
| deploy 전 모든 gate | [ ] PASS |
| live `/version.json` SHA | `<LIVE_FULL_SHA>` |
| lockfile·readiness manifest hash | [ ] 일치 |
| root·CSP·nosniff healthcheck | [ ] PASS |

## 7. 운영 스모크 테스트

승인된 leader/member 계정으로 최소 범위만 확인합니다. 운영 데이터에 시험 레코드를
만들었다면 즉시 정리하고 감사 이력을 확인합니다.

| 역할 | 확인 | 기대 | 완료 |
|---|---|---|:---:|
| 공통 | 로그인·로그아웃 | 설정 오류·콘솔 치명 오류 없음 | [ ] |
| leader | 홈·공지·검토·변경·프로젝트·파트원 탭 | 권한 화면 정상 | [ ] |
| member | 홈·내 검토·변경·프로젝트·내 담당 | leader 전용 탭 미노출 | [ ] |
| member | 검토요청 생성·딥링크 | pending 생성, 새로고침 후 같은 항목 | [ ] |
| leader | 피드백·최종 판단 | 상태·이력·badge 반영 | [ ] |
| 공통 | 동기화·모바일 drawer·모달 keyboard | 경고·focus·overflow 이상 없음 | [ ] |
| leader | 활동·감사 이력 | 예상 mutation 기록 | [ ] |

## 8. 릴리스 종료

| 항목 | 값 |
|---|---|
| 완료 시각(KST) | `<YYYY-MM-DD HH:mm>` |
| 승인자·운영자 | `<INTERNAL_RECORD_ONLY>` |
| 운영 SHA | `<MAIN_FULL_SHA>` |
| Release tag | `<TAG_OR_NOT_CREATED>` |
| CI / Backup / DB / Deploy | `<RUN_IDS>` |
| 스모크 결과 | `<PASS_OR_INCIDENT_REFERENCE>` |
| 후속 작업 | `<NONE_OR_PRIVATE_REFERENCE>` |

Release tag는 실제 운영 `/version.json`과 같은 SHA에만 생성합니다. 이 체크리스트의
실제 URL·계정·개인정보·credential 값은 저장소가 아닌 승인된 내부 운영 기록에
남깁니다.

## 실패·롤백

- PR 전 실패: 후보 브랜치에서 수정하고 전체 후보 검증을 다시 실행합니다.
- DB Migrate 전 실패: 운영에는 반영하지 않고 CI·backup 증거부터 다시 만듭니다.
- DB Migrate 후 Worker 배포 전 실패: DB가 구 Worker와 호환되는지 확인하고
  deploy를 중단한 채 roll-forward PR을 준비합니다.
- Worker healthcheck 실패: 이전 정상 SHA를 기준으로 새 CI → Backup → DB Migrate
  → Deploy 승격을 수행합니다.
- 적용된 migration은 되돌리거나 수정하지 않습니다. 새 append-only migration으로
  보정합니다.
- 데이터 복원이 필요하면 [DR_CONTRACT.md](./DR_CONTRACT.md)와
  [OPERATIONS.md](./OPERATIONS.md)의 복구 절차를 사용합니다.
