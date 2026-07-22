# 직접 수행 작업 계획서 (Manual Tasks Plan)

> **대상**: 파트장 또는 지정 운영자  
> **목적**: 코드·CI 작업 완료 후, **운영 환경에 반영하고 검증**하기 위해 사람이 직접 해야 하는 작업을 순서대로 정리한다.  
> **전제**: 브랜치 `main`, 최신 HEAD 기준 — 로컬에서 `npm test`, `npm run build`, `npm run lint`, `npm run typecheck` 통과 상태를 확인한다.

---

## 1. 한눈에 보기

| 순서 | 작업 | 담당 | 예상 소요 | 차단 관계 |
|:---:|------|------|:--------:|-----------|
| **0** | 사전 준비 (Supabase 프로젝트 생성 + CLI 설치) | 파트장 | 20분 | **모든 작업의 전제** |
| **A** | Git push + CI 확인 | 운영자 | 15분 | 없음 |
| **B** | GitHub Variables/Secrets 등록 | 운영자 | 20분 | **A보다 먼저 권장** (아래 주의 참고) |
| **C** | Supabase 마이그레이션 적용 | 운영자 | 30분 | D, E, F 선행 **필수** |
| **D** | Supabase Auth·초기 계정 | 파트장 | 30분 | C 이후 |
| **E** | Workers 배포 + 앱 스모크 | 운영자 | 20분 | B, C, D 이후 |
| **F** | RLS·기능 수동 검증 | 파트장 | 60~90분 | C, D, E 이후 |
| **G** | 자동 백업 첫 실행 + 복구 리허설 | 운영자 | 45~60분 | B, C 이후 (E와 병렬 가능) |

**권장 일정 (1일 집중)**  
사전: 0 / 오전: B → A → C → D → E / 오후: F → G

---

## 2. 작업 0 — 사전 준비 (Supabase 프로젝트 + CLI)

### 목표
이후 모든 작업의 전제인 **Supabase 프로젝트**와 **Supabase CLI**를 준비한다. 이게 없으면 작업 B에서 등록할 API 값(URL/anon key)을 읽을 프로젝트가 없고, 작업 C의 `db push`·작업 G의 백업이 실행되지 않는다.

### 절차

1. **Supabase 프로젝트 생성**
   - Dashboard > New project
   - **리전(Region)은 반드시 `Northeast Asia (Seoul) / ap-northeast-2`** 로 선택한다.
   - DB 비밀번호는 안전한 곳에 보관한다 (백업·복원 `DATABASE_URL`에 필요).
   - 생성 URL `https://supabase.com/dashboard/project/<PROJECT_REF>`의 `<PROJECT_REF>`를 이 문서 하단 서명란에 기록한다.

2. **Supabase CLI 설치** (Windows 파트장 PC 기준)
   ```powershell
   scoop install supabase   # Scoop 권장. 또는 매번 npx supabase 사용
   ```
3. **로그인**
   ```powershell
   supabase login            # npx 사용 시: npx supabase login
   ```

> **개인정보 공지:** 이 프로젝트에는 팀원 이름·이메일이 저장된다. 서울 리전(외부 클라우드)에 저장된다는 사실을 **사용 시작 전 팀에 1회 공지**한다. 상세: [OPERATIONS.md](./OPERATIONS.md) 개인정보 처리 절.

### 완료 기준
- [ ] Supabase 프로젝트 **서울 리전(ap-northeast-2)** 으로 생성, `<PROJECT_REF>` 기록
- [ ] `supabase --version` 정상 출력, `supabase login` 완료
- [ ] 팀 공지 1회 완료 (일자 기록)

---

## 3. 작업 A — Git push 및 CI 확인

### 목표
후보 브랜치를 원격에 반영하고 PR로 `main`에 병합한 뒤, 동일 SHA의 CI 전체가 통과하는지 확인한다.

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

2. 후보 브랜치 push 및 PR 병합
   ```bash
   git push -u origin <BRANCH>
   ```

3. CI 결과 확인
   ```bash
   gh run list --limit 5
   gh run watch
   ```
   **통과 기준**: `typecheck`, `lint`, unit, RLS, preview E2E, remote E2E, `build` 모두 green. 성공한 CI run ID와 full SHA를 기록한다.

> ⚠️ **운영 배포는 자동화하지 않는다.** `main` push는 CI만 실행한다. DB Migrate에는 동일 SHA의 `ci_run_id`와 `backup_run_id`, Deploy Worker에는 동일 SHA의 `ci_run_id`와 `db_migrate_run_id` 및 `deploy_confirm=true`가 필요하다.
> - 운영 배포는 작업 B·C·D를 완료한 뒤 **작업 E에서만** 수행한다.
> - CI 테스트만 확인하려면 CI workflow를 사용한다. 자세한 승격 조건은 [DEPLOYMENT.md](./DEPLOYMENT.md) "배포 성공 vs 스킵 구분"을 참고한다.

### 완료 기준
- [ ] 원격 `main`(또는 merge된 PR)에 최신 커밋 반영
- [ ] CI green

---

## 4. 작업 B — GitHub Variables / Secrets

### 목표
Cloudflare Workers 수동 운영 배포와 빌드 시 Supabase env 주입이 가능하도록 저장소 설정을 완료한다.

### 등록 위치
GitHub 저장소 → **Settings → Secrets and variables → Actions**

### Variables (공개 가능한 값)

| 이름 | 값 출처 | 비고 |
|------|---------|------|
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare Dashboard 우측 Account ID | |
| `WORKER_NAME` | 배포할 Worker 이름 (예: `sqa-p1-workflow`) | |
| `WORKER_URL` | 배포 후 healthcheck 대상 URL | `https://<worker>.<subdomain>.workers.dev` |
| `VITE_SUPABASE_URL` | Supabase → Settings → API → Project URL | `https://xxxx.supabase.co` |

### Secrets (민감)

| 이름 | 값 출처 | 용도 | 금지 |
|------|---------|------|------|
| `VITE_SUPABASE_ANON_KEY` | Supabase → Settings → API → anon public | 배포 (E) | service_role 키 **사용 금지** |
| `CLOUDFLARE_API_TOKEN` | Cloudflare → My Profile → API Tokens (Workers Edit) | 배포 (E) | |
| `SUPABASE_DB_URL` | Supabase → Dashboard → Connect의 **Session pooler URI** (비밀번호 포함) | 매일 자동 백업 · DB Migrate 워크플로 | |
| `BACKUP_PASSPHRASE` | 새로 정한 백업 암호화 암구호 | 매일 자동 백업 | **분실 시 백업 복원 불가** — 비밀번호 관리자에 보관 |

### 확인
- [ ] Variables 4개, Secrets 4개 등록 완료
- [ ] `git grep`으로 저장소에 URL/키/계정 ID가 **없음**

### 완료 기준
- [ ] Variables 4개, Secrets 4개 등록 완료
- [ ] 실제 운영 URL·키·계정 ID가 저장소에 포함되지 않음

---

## 5. 작업 C — Supabase 마이그레이션 적용

### 목표
`supabase/migrations/`의 DB·Storage·RLS 변경을 **운영(또는 스테이징) Supabase**에 반영한다.

### 적용 범위

`supabase/migrations/`의 migration을 순서대로 적용한다. 파일 수·순서·설명은 자동 생성되는 [SUPABASE_MIGRATIONS.md](./SUPABASE_MIGRATIONS.md)를 확인하고, 적용 직전 동일 `main` SHA의 CI와 암호화 백업을 검증한다. 기존 migration은 수정·삭제·rename하지 않는다.

### 방법 1 — GitHub Actions (권장)

1. Actions → **Backup DB**를 동일 `main` SHA에서 실행하고 성공한 run ID를 기록한다.
2. Actions → **DB Migrate**를 `main`에서 실행한다.
3. 입력값에 동일 SHA의 성공한 `ci_run_id`와 24시간 이내 `backup_run_id`를 넣는다.
4. migration history exact set과 canonical readiness가 모두 green인지 확인한다.

### 방법 2 — Supabase CLI (break-glass)

Actions를 사용할 수 없는 장애 상황에서만 승인자·대상·백업·후속 검증을 기록하고 실행한다. 이 경로는 workflow provenance guard를 우회하므로 정규 승격에 사용하지 않는다.

```bash
npx supabase login
npx supabase link --project-ref <PROJECT_REF>
npx supabase db push
```

`PROJECT_REF`: Supabase Dashboard URL `https://supabase.com/dashboard/project/<PROJECT_REF>`

### 방법 3 — SQL Editor (복구 전용)

Dashboard → **SQL Editor**에서 [SUPABASE_MIGRATIONS.md](./SUPABASE_MIGRATIONS.md) 목록 순서대로 실행.

> SQL Editor 수동 적용은 복구·break-glass 검증용으로만 사용한다. 운영 DB의 정규 반영은 반드시 `DB Migrate`/CLI 경로를 사용해야 하며, SQL Editor 실행만으로는 `schema_migrations` 이력이 만들어지지 않아 Deploy Worker의 readiness gate를 통과하지 못한다. 수동 적용 후 운영 반영이 필요하면 먼저 백업·객체 검증을 완료하고 별도 승인된 migration-history repair 절차를 따른다.

> 이미 적용된 migration은 **다시 실행하지 않는다.**

### 적용 후 확인

`scripts/sql/verify/manifest.json`의 `readinessFiles`를 `psql -X -v ON_ERROR_STOP=1`로 모두 실행하고, 자동 생성된 migration 목록과 원격 `schema_migrations`가 정확히 일치하는지 확인한다. 정규 workflow는 이 검증을 자동 수행한다.

### 완료 기준
- [ ] 동일 SHA CI·Backup·DB Migrate run ID 기록
- [ ] migration history exact set과 canonical readiness 통과
- [ ] 로컬 `npm test -- src/migrations.test.ts` 통과

상세: [SUPABASE_MIGRATIONS.md](./SUPABASE_MIGRATIONS.md)

---

## 6. 작업 D — Supabase Auth 및 초기 계정

### 목표
파트장 1명 + RLS 검증용 member 2명을 준비한다.

### 6.1 첫 파트장 bootstrap

SQL Editor에서 1회 실행 (이메일·이름을 실제 값으로 교체):

```sql
insert into public.allowed_users (email, name, role)
values ('leader@your-domain.com', '파트장 이름', 'leader')
on conflict (email) do update
set name = excluded.name, role = excluded.role;
```

그 다음 비밀번호 관리자에서 16자 이상의 계정별 무작위 임시 비밀번호를 생성하고, Supabase Dashboard > Authentication > Users > **Add user** 로 파트장 계정을 만든다. Minimum password length는 8 이상을 유지하며 계정 생성을 위해 낮추지 않는다.

### 6.2 RLS 검증용 member 2명 생성

RLS·권한 검증(작업 F)에는 파트장 외에 member 계정 2개가 필요하다.

1. `allowed_users`에 member 2명을 등록한다(이메일은 실제 값으로 교체):
   ```sql
   insert into public.allowed_users (email, name, role)
   values
     ('member1@your-domain.com', '파트원1', 'member'),
     ('member2@your-domain.com', '파트원2', 'member')
   on conflict (email) do update
   set name = excluded.name, role = excluded.role;
   ```
2. Dashboard > Authentication > Users > **Add user** 로 위 2개 이메일 계정을 각각 생성한다. 각 계정에 서로 다른 16자 이상의 무작위 임시 비밀번호를 사용한다.
3. 각 계정은 승인된 1:1 채널로 임시 비밀번호를 전달받고 **본인이 즉시 로그인**해 `must_change_password` 화면에서 8자 이상으로 변경한다. 한 명씩 즉시 온보딩한다([OPERATIONS.md](./OPERATIONS.md) 임시 비밀번호 절 참고).

### 6.3 Auth 설정 확인

Supabase → **Authentication → URL Configuration**

| 항목 | 권장 값 |
|------|---------|
| Site URL | `<WORKER_URL>` |
| Redirect URLs | `<WORKER_URL>` + `http://localhost:5173` |

Supabase → **Authentication → Providers → Email**

| 항목 | 권장 값 |
|------|---------|
| Enable email signup (Allow new users to sign up) | **OFF** |
| Confirm email | **ON** (`mailer_autoconfirm=false`; 이메일 소유 확인 유지) |

> public sign-up이 ON이면 앱 외 경로로 가입이 가능하다. 운영 프로젝트에는 이미 `disable_signup: true`가 적용되어 있으므로([OPERATIONS.md](./OPERATIONS.md) Auth 절), 여기서는 설정이 유지되고 있는지 재확인한다.

### 6.4 첫 로그인

1. 계정별 무작위 임시 비밀번호로 로그인
2. `must_change_password` 화면에서 **8자 이상**으로 변경
3. 파트장 홈·마스터 탭 진입 확인

### 완료 기준
- [ ] `profiles`에 leader 1명, member 2명 존재
- [ ] 파트장 `canManageTeamData` 화면(마스터 탭) 접근 가능
- [ ] 파트원은 leader 전용 탭 접근 불가
- [ ] public sign-up 비활성화 확인

---

## 7. 작업 E — Workers 배포 및 앱 스모크

### 목표
`<WORKER_URL>`에서 빌드된 앱이 Supabase와 연결되어 동작하는지 확인한다.

### 자동 배포
작업 B·C·D 완료 후 Actions → **Deploy Worker** → `workflow_dispatch` (`main`, `deploy_confirm=true`, 동일 SHA의 성공한 `ci_run_id`와 24시간 이내 `db_migrate_run_id`)

Deploy Worker 워크플로는 CI/DB provenance → RLS → `typecheck` → `lint` → unit → deploy config/readiness → `build` → deploy → live provenance/healthcheck 순서로 실행된다.

### 스모크 체크리스트 (15분)

| # | 확인 | 기대 |
|---|------|------|
| 1 | 로그인 | 파트장 홈 표시 |
| 2 | 검토요청 생성 | `pending` 상태, 목록 반영 |
| 3 | 해시 URL | `#/reviews?id=<uuid>` 새로고침 후 동일 항목 선택 |
| 4 | 프로젝트 생성 | 기본 배정 0명, 명시적 선택 후만 배정 |
| 5 | mutation 실패 | DB/validation 오류 시 모달이 닫히지 않음 |
| 6 | 활동 로그 탭 | leader만 전체 목록 |
| 7 | 보안 헤더 | `curl -I <WORKER_URL>` 응답에 `Content-Security-Policy` 등 `public/_headers`의 헤더 포함 (미적용이면 CSP가 전부 무효) |

### 완료 기준
- [ ] Deploy Worker가 provenance guard부터 live healthcheck까지 **skip 없이** 성공함 (Actions run ID: `<DEPLOY_RUN_ID>`)
- [ ] `<WORKER_URL>` 접속·로그인·해시 라우팅·콘솔 치명 오류 없음
- [ ] 파트장 로그인·CRUD 1회 이상 성공
- [ ] 보안 헤더(CSP) 적용 확인 + 브라우저 콘솔에 CSP violation 없음

---

## 8. 작업 F — RLS 및 권한 수동 검증

### 목표
`docs/TEST_PLAN.md` RLS 섹션을 **3계정**으로 재현해 데이터 격리를 확인한다.

### 검증 매트릭스 (요약)

- member A는 member B 데이터 미노출
- leader는 전체 조회·수정 가능
- member가 다른 requester_id로 review 생성 시 RLS 거부
- leader가 제품/업무/대분류 삭제 시 activity log 기록 확인
- 마지막 active leader 비활성화/강등 시 DB에서 거부
- member가 `public_leader_profiles`로 파트장 이름 조회 가능 (email 미노출) — 202607080001로 view 노출이 복원되었는지 **재확인**
- **`must_change_password=true` 계정은 데이터 접근이 차단됨** (202607080001 검증): 임시 계정을 비밀번호 변경 전 상태로 두고, 세션을 얻어 REST/RPC로 `review_requests` 등을 조회·삽입해도 **RLS로 거부**되는지 확인한다. 비밀번호 변경 후에는 정상 접근되는지 대조한다. (자기 `profiles` row 조회와 비밀번호 변경 RPC만 예외)

### 완료 기준
- [ ] TEST_PLAN RLS 항목 통과
- [ ] 실패 0건, 또는 실패 항목·조치와 해당 후보 SHA 기록
- [ ] 마지막 active leader 비활성화/강등 거부 확인
- [ ] 비활성 계정 로그인 차단 확인
- [ ] 검증용 데이터와 일회용 계정 정리

---

## 9. 작업 G — 백업 및 복구 리허설

백업은 GitHub Actions(`backup.yml`)가 **매일 05:00 KST**에 자동 수행한다(암호화 아티팩트, 보존 90일). 이 작업에서는 첫 실행과 복구를 검증한다. 상세: [OPERATIONS.md](./OPERATIONS.md)

1. 작업 B의 `SUPABASE_DB_URL`·`BACKUP_PASSPHRASE` Secrets 등록 확인
2. Actions → **Backup DB** → Run workflow(수동 1회) → run green + Job Summary에 `Backup OK` 확인
3. 아티팩트 다운로드 → 복호화(`openssl enc -d ...`, OPERATIONS.md 참고) → 복구 리허설 1회

### 완료 기준
- [ ] Backup DB run green + `Backup OK` 확인
- [ ] 암호화 아티팩트의 복호화와 manifest 검증 성공
- [ ] 폐기 가능한 target에서 복원·Auth UUID/FK/login 검증 성공
- [ ] 평문 덤프와 검증용 target 정리

---

## 10. 진행 체크리스트 (복사용)

```
[ ] 0. Supabase 프로젝트(서울 ap-northeast-2) + CLI 설치 + 팀 공지
[ ] A. git push / PR merge + 동일 SHA CI green
[ ] B. GitHub Variables / Secrets 확인
[ ] C. 동일 SHA Backup DB → DB Migrate + readiness 통과
[ ] D. Auth 설정과 leader/member 계정 확인
[ ] E. 동일 SHA Deploy Worker + provenance/healthcheck 통과
[ ] F. RLS 검증 (TEST_PLAN.md) + must_change_password 차단 확인
[ ] G. 암호화 백업 복호화 + full DR 리허설 기록
```

**최종 서명**

| 항목 | 값 |
|------|-----|
| 완료일 | `<YYYY-MM-DD>` |
| 담당 | `<OPERATOR>` |
| 운영 URL | `<WORKER_URL>` (public 저장소 관례상 실값 미기재) |
| Supabase project ref | `<PROJECT_REF>` (동일) |
| GitHub HEAD | `<FULL_SHA>` |
| Actions run ID | CI `<CI_RUN_ID>` / Backup `<BACKUP_RUN_ID>` / DB Migrate `<DB_RUN_ID>` / Deploy `<DEPLOY_RUN_ID>` |
| 비고 | `<RESULT_AND_FOLLOW_UP>` |

---

## 11. 관련 문서

| 문서 | 용도 |
|------|------|
| [DEPLOYMENT.md](./DEPLOYMENT.md) | GitHub, Workers, Supabase 초기 설정 |
| [SUPABASE_MIGRATIONS.md](./SUPABASE_MIGRATIONS.md) | 마이그레이션 적용·확인 SQL |
| [OPERATIONS.md](./OPERATIONS.md) | 백업·장애·사용자 제거 런북 |
| [TEST_PLAN.md](./TEST_PLAN.md) | 기능·RLS 검증 시나리오 전체 |
