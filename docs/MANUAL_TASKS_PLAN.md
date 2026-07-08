# 직접 수행 작업 계획서 (Manual Tasks Plan)

> **대상**: 파트장 또는 지정 운영자  
> **목적**: 코드·CI 작업 완료 후, **운영 환경에 반영하고 검증**하기 위해 사람이 직접 해야 하는 작업을 순서대로 정리한다.  
> **전제**: 브랜치 `main`, 최신 HEAD 기준 — 로컬에서 `npm test`, `npm run build`, `npm run lint`, `npm run typecheck` 통과 상태를 확인한다.

---

## 1. 한눈에 보기

| 순서 | 작업 | 담당 | 예상 소요 | 차단 관계 |
|:---:|------|------|:--------:|-----------|
| **A** | Git push + CI 확인 | 운영자 | 15분 | 없음 |
| **B** | GitHub Variables/Secrets 등록 | 운영자 | 20분 | C, D 선행 권장 |
| **C** | Supabase 마이그레이션 적용 | 운영자 | 30분 | D, E, F 선행 **필수** |
| **D** | Supabase Auth·초기 계정 | 파트장 | 30분 | C 이후 |
| **E** | Workers 배포 + 앱 스모크 | 운영자 | 20분 | B, C, D 이후 |
| **F** | RLS·기능 수동 검증 | 파트장 | 60~90분 | C, D, E 이후 |
| **G** | 주간 백업 1회 + 복구 리허설 | 운영자 | 45~60분 | C 이후 (E와 병렬 가능) |

**권장 일정 (1일 집중)**  
오전: A → B → C → D → E / 오후: F → G

---

## 2. 작업 A — Git push 및 CI 확인

### 목표
로컬 `main`의 개선 사항을 원격에 반영하고, GitHub Actions 4 job(typecheck / lint / test / build)이 통과하는지 확인한다.

### 절차

1. 로컬 상태 확인
   ```bash
   git status
   git log -2 --oneline
   npm test
   npm run build
   npm run lint
   npm run typecheck
   ```

2. 원격 push (`main`이 protected이면 PR 또는 관리자 승인 필요)
   ```bash
   git push origin main
   ```

3. CI 결과 확인
   ```bash
   gh run list --limit 5
   gh run watch
   ```
   **통과 기준**: `typecheck`, `lint`, `test`, `build` 모두 green.

### 완료 기준
- [ ] 원격 `main`(또는 merge된 PR)에 최신 커밋 반영
- [ ] CI + Deploy Worker green (Actions run ID: `<ACTIONS_RUN_ID>`)

---

## 3. 작업 B — GitHub Variables / Secrets

### 목표
Cloudflare Workers 자동 배포와 빌드 시 Supabase env 주입이 가능하도록 저장소 설정을 완료한다.

### 등록 위치
GitHub 저장소 → **Settings → Secrets and variables → Actions**

### Variables (공개 가능한 값)

| 이름 | 값 출처 | 비고 |
|------|---------|------|
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare Dashboard 우측 Account ID | |
| `WORKER_NAME` | 배포할 Worker 이름 (예: `sqa-p1-workflow`) | |
| `VITE_SUPABASE_URL` | Supabase → Settings → API → Project URL | `https://xxxx.supabase.co` |

### Secrets (민감)

| 이름 | 값 출처 | 금지 |
|------|---------|------|
| `VITE_SUPABASE_ANON_KEY` | Supabase → Settings → API → anon public | service_role 키 **사용 금지** |
| `CLOUDFLARE_API_TOKEN` | Cloudflare → My Profile → API Tokens (Workers Edit) | |

### 확인
- [ ] Variables 3개, Secrets 2개 등록 완료
- [ ] `git grep`으로 저장소에 URL/키/계정 ID가 **없음**

### 완료 기준
- [ ] `workflow_dispatch` 또는 main push 후 deploy 워크플로가 **skip 없이** 실행됨 (Secrets 미설정 시 **test만** 통과, build/deploy는 스킵)

---

## 4. 작업 C — Supabase 마이그레이션 적용

### 목표
`supabase/migrations/`의 DB·Storage·RLS 변경을 **운영(또는 스테이징) Supabase**에 반영한다.

### 최신 적용 범위 (확인 필요)

다음 migration이 모두 적용되었는지 확인한다:

- `202607070001` ~ `202607070005` (audit RLS, PUBLIC revoke, activity log entity types, last active leader 보호)
- 그 이전 migration 전체 ([SUPABASE_MIGRATIONS.md](./SUPABASE_MIGRATIONS.md) 목록 참고)

| 미적용 migration | 증상 |
|------------------|------|
| `202607070004` | 제품/업무/대분류 삭제 시 activity log insert 실패 |
| `202607070005` | 마지막 active leader 비활성화·강등 가능 (운영 복구 불가 위험) |
| `202607070003` | mutation RPC가 PUBLIC/anon에 노출될 수 있음 |

### 방법 1 — Supabase CLI (권장)

```bash
npx supabase login
npx supabase link --project-ref <PROJECT_REF>
npx supabase db push
```

`PROJECT_REF`: Supabase Dashboard URL `https://supabase.com/dashboard/project/<PROJECT_REF>`

### 방법 2 — SQL Editor (수동)

Dashboard → **SQL Editor**에서 [SUPABASE_MIGRATIONS.md](./SUPABASE_MIGRATIONS.md) 목록 순서대로 실행.

> 이미 적용된 migration은 **다시 실행하지 않는다.**

### 적용 후 확인 SQL

```sql
select version from supabase_migrations.schema_migrations
where version in ('202607070004', '202607070005');

select pg_get_constraintdef(oid)
from pg_constraint
where conrelid = 'public.activity_logs'::regclass
  and conname = 'activity_logs_entity_type_check';

select tgname from pg_trigger
where tgrelid in ('public.profiles'::regclass, 'public.allowed_users'::regclass)
  and tgname like '%last_active_leader%';
```

### 완료 기준
- [ ] 위 확인 쿼리 결과 정상
- [ ] 로컬 `npm test -- src/migrations.test.ts` 통과

상세: [SUPABASE_MIGRATIONS.md](./SUPABASE_MIGRATIONS.md)

---

## 5. 작업 D — Supabase Auth 및 초기 계정

### 목표
파트장 1명 + RLS 검증용 member 2명을 준비한다.

### 5.1 첫 파트장 bootstrap

SQL Editor에서 1회 실행 (이메일·이름을 실제 값으로 교체):

```sql
insert into public.allowed_users (email, name, role)
values ('leader@your-domain.com', '파트장 이름', 'leader')
on conflict (email) do update
set name = excluded.name, role = excluded.role;
```

### 5.2 Auth 설정 확인

Supabase → **Authentication → URL Configuration**

| 항목 | 권장 값 |
|------|---------|
| Site URL | `<WORKER_URL>` |
| Redirect URLs | `<WORKER_URL>` + `http://localhost:5173` |

Supabase → **Authentication → Providers → Email**

| 항목 | 권장 값 |
|------|---------|
| Enable email signup (Allow new users to sign up) | **OFF** |
| Confirm email | OFF (내부 앱, Dashboard Add user만) |

> public sign-up이 ON이면 앱 외 경로로 가입이 가능하다. Dashboard에서 OFF 후 probe 또는 Dashboard에서 직접 확인한다.

### 5.3 첫 로그인

1. 임시 비밀번호 `1234`로 로그인 (최소 4자)
2. `must_change_password` 화면에서 **8자 이상**으로 변경 (`1234` 재사용 불가)
3. 파트장 홈·마스터 탭 진입 확인

### 완료 기준
- [ ] `profiles`에 leader 1명, member 2명 존재
- [ ] 파트장 `canManageTeamData` 화면(마스터 탭) 접근 가능
- [ ] 파트원은 leader 전용 탭 접근 불가
- [ ] public sign-up 비활성화 확인

---

## 6. 작업 E — Workers 배포 및 앱 스모크

### 목표
`<WORKER_URL>`에서 빌드된 앱이 Supabase와 연결되어 동작하는지 확인한다.

### 자동 배포
작업 B 완료 후 `main` push 또는 Actions → **Deploy Worker** → `workflow_dispatch`

Deploy Worker 워크플로는 `typecheck` → `lint` → `test` → deploy config check → `build` → deploy 순서로 실행된다.

### 스모크 체크리스트 (15분)

| # | 확인 | 기대 |
|---|------|------|
| 1 | 로그인 | 파트장 홈 표시 |
| 2 | 검토요청 생성 | `pending` 상태, 목록 반영 |
| 3 | 해시 URL | `#/reviews?id=<uuid>` 새로고침 후 동일 항목 선택 |
| 4 | 프로젝트 생성 | 기본 배정 0명, 명시적 선택 후만 배정 |
| 5 | mutation 실패 | DB/validation 오류 시 모달이 닫히지 않음 |
| 6 | 활동 로그 탭 | leader만 전체 목록 |

### 완료 기준
- [ ] `<WORKER_URL>` 접속·로그인·해시 라우팅·콘솔 치명 오류 없음
- [ ] 파트장 로그인·CRUD 1회 이상 성공

---

## 7. 작업 F — RLS 및 권한 수동 검증

### 목표
`docs/TEST_PLAN.md` RLS 섹션을 **3계정**으로 재현해 데이터 격리를 확인한다.

### 검증 매트릭스 (요약)

- member A는 member B 데이터 미노출
- leader는 전체 조회·수정 가능
- member가 다른 requester_id로 review 생성 시 RLS 거부
- leader가 제품/업무/대분류 삭제 시 activity log 기록 확인
- 마지막 active leader 비활성화/강등 시 DB에서 거부
- member가 `public_leader_profiles`로 파트장 이름 조회 가능 (email 미노출)

### 완료 기준
- [ ] TEST_PLAN RLS 항목 **전체** 통과
- [ ] 실패 0건, 또는 실패 항목·조치 기록

---

## 8. 작업 G — 백업 및 복구 리허설

주 1회 백업 + 분기 1회 복구 리허설. 상세: [OPERATIONS.md](./OPERATIONS.md)

### 완료 기준
- [ ] 백업 파일 1개 이상 보관
- [ ] 복구 리허설 1회 성공 기록

---

## 9. 진행 체크리스트 (복사용)

```
[ ] A. git push / PR merge + CI green
[ ] B. GitHub Variables/Secrets 5개
[ ] C. Supabase migration 202607070001~202607070005 적용 + 확인
[ ] D. leader 계정 + Auth Site URL/Redirect + public sign-up OFF
[ ] E. Workers 배포 + 스모크
[ ] F. RLS 검증 (TEST_PLAN.md)
[ ] G. 백업 1회 + 복구 리허설 기록
```

**최종 서명**

| 항목 | 값 |
|------|-----|
| 완료일 | |
| 담당 | |
| 운영 URL | `<WORKER_URL>` |
| Supabase project ref | `<PROJECT_REF>` |
| GitHub HEAD | (최신 main 커밋 SHA) |
| Actions run ID | `<ACTIONS_RUN_ID>` |
| 비고 | |

---

## 10. 관련 문서

| 문서 | 용도 |
|------|------|
| [DEPLOYMENT.md](./DEPLOYMENT.md) | GitHub, Workers, Supabase 초기 설정 |
| [SUPABASE_MIGRATIONS.md](./SUPABASE_MIGRATIONS.md) | 마이그레이션 적용·확인 SQL |
| [OPERATIONS.md](./OPERATIONS.md) | 백업·장애·사용자 제거 런북 |
| [TEST_PLAN.md](./TEST_PLAN.md) | 기능·RLS 검증 시나리오 전체 |
