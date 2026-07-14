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
로컬 `main`을 원격에 반영하고, GitHub Actions 4 job(typecheck / lint / test / build)이 통과하는지 확인한다.

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

> ⚠️ **운영 배포는 자동화하지 않는다.** `main` push는 CI만 실행하고, Deploy Worker는 작업 B 완료 후 `workflow_dispatch`에서 `main` + `deploy_confirm=true`를 명시해야 한다. Secrets/Variables가 없거나 확인값이 false면 운영 단계는 실패·스킵되도록 설계되어 있다.
> - **권장: 작업 B를 배포 확인보다 먼저** 완료한다.
> - 아래 완료 기준의 "Deploy Worker green"은 운영 증거를 검토한 뒤 수동 실행했을 때의 기준이다.
> - CI 테스트만 확인하려면 CI workflow를 사용한다. Deploy Worker는 `workflow_dispatch`에서 `main`과 `deploy_confirm=true`를 명시한 경우에만 운영 배포 단계로 진행한다. 자세한 구분은 [DEPLOYMENT.md](./DEPLOYMENT.md) "배포 성공 vs 스킵 구분" 참고.

### 완료 기준
- [ ] 원격 `main`(또는 merge된 PR)에 최신 커밋 반영
- [ ] CI green
- [ ] Deploy Worker green (**작업 B 완료 후** 재실행 기준, Actions run ID: `<ACTIONS_RUN_ID>`)

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
| `VITE_SUPABASE_URL` | Supabase → Settings → API → Project URL | `https://xxxx.supabase.co` |

### Secrets (민감)

| 이름 | 값 출처 | 용도 | 금지 |
|------|---------|------|------|
| `VITE_SUPABASE_ANON_KEY` | Supabase → Settings → API → anon public | 배포 (E) | service_role 키 **사용 금지** |
| `CLOUDFLARE_API_TOKEN` | Cloudflare → My Profile → API Tokens (Workers Edit) | 배포 (E) | |
| `SUPABASE_DB_URL` | Supabase → Dashboard → Connect의 **Session pooler URI** (비밀번호 포함) | 매일 자동 백업 · DB Migrate 워크플로 | |
| `BACKUP_PASSPHRASE` | 새로 정한 백업 암호화 암구호 | 매일 자동 백업 | **분실 시 백업 복원 불가** — 비밀번호 관리자에 보관 |

### 확인
- [ ] Variables 3개, Secrets 4개 등록 완료
- [ ] `git grep`으로 저장소에 URL/키/계정 ID가 **없음**

### 완료 기준
- [ ] Deploy Worker `workflow_dispatch`를 `main` + `deploy_confirm=true`로 실행하고 **skip 없이** 완료됨

---

## 5. 작업 C — Supabase 마이그레이션 적용

### 목표
`supabase/migrations/`의 DB·Storage·RLS 변경을 **운영(또는 스테이징) Supabase**에 반영한다.

### 적용 범위

`supabase/migrations/`의 **현재 총 44개** migration 파일을 순서대로 적용한다 ([SUPABASE_MIGRATIONS.md](./SUPABASE_MIGRATIONS.md) 목록 참고). 이번 변경에서는 `20260714075451`을 프런트 배포보다 먼저 별도 migration 단계로 적용하고, 적용 직전 동일 `main` SHA 백업 및 함수·ACL·RLS 검증을 완료한다.

> 2026-07-09 서명 시점에는 29개였고, 30번째 `202607090001`(Realtime)은 알림 패키지와 함께 추가되었다 — 적용 기록은 하단 "추가 배포 기록" 참조.

- `202607090001` — 검토요청 INSERT Realtime 발행 (파트장 즉시 알림용, RLS 불변)
- `202607080001` — 비밀번호 변경 전 RLS 차단 + leader 이름 view + last-active-leader 카운터 잠금
- `202607070001` ~ `202607070005` — audit RLS, PUBLIC revoke, activity log entity types, last active leader 보호

| 미적용 migration | 증상 |
|------------------|------|
| `202607090001` | Realtime 즉시 반영이 **오류 없이 조용히** 동작하지 않음 — 5분 폴링으로만 갱신 (겉으로는 정상처럼 보이므로 publication 확인 SQL로만 판별 가능) |
| `202607080001` | `must_change_password=true` 계정이 비밀번호 변경 전에도 REST/RPC로 데이터 접근 가능 (첫 로그인 강제가 UI에만 존재) |
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

> SQL Editor 수동 적용은 복구·break-glass 검증용으로만 사용한다. 운영 DB의 정규 반영은 반드시 `DB Migrate`/CLI 경로를 사용해야 하며, SQL Editor 실행만으로는 `schema_migrations` 이력이 만들어지지 않아 Deploy Worker의 readiness gate를 통과하지 못한다. 수동 적용 후 운영 반영이 필요하면 먼저 백업·객체 검증을 완료하고 별도 승인된 migration-history repair 절차를 따른다.

> 이미 적용된 migration은 **다시 실행하지 않는다.**

### 적용 후 확인 SQL

> ⚠️ **`schema_migrations` 조회는 CLI `db push`로 적용한 경우에만 유효하다.** `supabase_migrations.schema_migrations`에는 **CLI `db push`로 적용한 migration만 기록**된다. **SQL Editor로 수동 적용**했다면 이 테이블이 비어 있어 아래 첫 쿼리가 **0건/오류**로 나온다 — 이는 실패가 아니다. 이 경우 아래 **constraint·trigger·함수 확인 쿼리로 실제 반영 여부를 검증**한다.

```sql
-- (CLI db push 경로에서만 유효) 적용된 버전 확인
select version from supabase_migrations.schema_migrations
where version in ('202607070004', '202607070005', '202607080001');

-- (경로 무관) 202607070004: activity_logs entity_type check constraint
select pg_get_constraintdef(oid)
from pg_constraint
where conrelid = 'public.activity_logs'::regclass
  and conname = 'activity_logs_entity_type_check';

-- (경로 무관) 202607070005: last-active-leader 보호 trigger
select tgname from pg_trigger
where tgrelid in ('public.profiles'::regclass, 'public.allowed_users'::regclass)
  and tgname like '%last_active_leader%';

-- (경로 무관) 202607080001: 비밀번호 강제 함수와 leader 이름 view 확인
select proname from pg_proc where proname = 'password_is_current';
select relname, reloptions from pg_class
where relname = 'public_leader_profiles';  -- security_invoker=false 여야 함
```

### 완료 기준
- [ ] 위 확인 쿼리 결과 정상
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
작업 B 완료 후 Actions → **Deploy Worker** → `workflow_dispatch` (`main`, `deploy_confirm=true`)

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
| 7 | 보안 헤더 | `curl -I <WORKER_URL>` 응답에 `Content-Security-Policy` 등 `public/_headers`의 헤더 포함 (미적용이면 CSP가 전부 무효) |

### 완료 기준
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
- [x] TEST_PLAN RLS 항목 통과 (아래 검증 기록 참조)
- [x] 실패 0건, 또는 실패 항목·조치 기록

### 검증 기록 (2026-07-09)

- **수행**: 파트장(앱 화면 수동) + Claude(일회용 member 계정으로 REST/RPC/Storage API 직접 호출 29건)
- **결과: 실패 0건.**
  - 변경 전(`must_change_password=true`): 본인 profiles 1행 외 전 테이블 조회 0건, 본인 명의 포함 모든 쓰기 RLS 거부 — 202607080001 서버 강제 확인
  - 변경 후(member): 타인 profiles/review_requests/profile_notes 미노출, 파트장 명의 도용 INSERT 거부, 본인 pending 검토요청 생성·수정·삭제 정상, status 셀프 승인 거부, 본인 role leader 상승 무효(0행), activity_logs 임의 target INSERT 거부, products/projects 쓰기 거부(projects는 created_by leader 트리거 거부), storage 본인 경로 업로드 성공·타인 경로 거부, `public_leader_profiles` 이름만 1행 이상 노출
  - 파트장 수동: member 간 격리, member 가능 작업이 검토요청 작성뿐임, leader 전체 조회·수정, member 화면 파트장 이름 표시 — 모두 확인
- **잔여(선택) 항목** — leader 세션이 필요해 자동 검증에서 제외, 앱에서 1분 내 확인 가능:
  - [ ] 마지막 active leader 본인 비활성화/강등 시도 → DB 거부 확인 (202607070005)
  - [x] (2026-07-14 정책 변경) 현재 로그인한 활성 leader 본인 배정은 허용, 다른 leader 배정은 거부하는 자동 RLS 테스트 추가
  - [ ] 테스트 계정 `is_active=false` 전환 후 로그인 → 안내 화면만 표시 확인
- **정리**: 테스트 중 생성한 검토요청·첨부파일은 삭제 완료. 일회용 계정(rls-test)은 Dashboard·초대 목록에서 삭제할 것.

---

## 9. 작업 G — 백업 및 복구 리허설

백업은 GitHub Actions(`backup.yml`)가 **매일 05:00 KST**에 자동 수행한다(암호화 아티팩트, 보존 90일). 이 작업에서는 첫 실행과 복구를 검증한다. 상세: [OPERATIONS.md](./OPERATIONS.md)

1. 작업 B의 `SUPABASE_DB_URL`·`BACKUP_PASSPHRASE` Secrets 등록 확인
2. Actions → **Backup DB** → Run workflow(수동 1회) → run green + Job Summary에 `Backup OK` 확인
3. 아티팩트 다운로드 → 복호화(`openssl enc -d ...`, OPERATIONS.md 참고) → 복구 리허설 1회

### 완료 기준
- [x] Backup DB run green + `Backup OK` 확인
- [x] 복호화 성공 + 복구 리허설 1회 성공 기록 (분기 1회 반복)

### 검증 기록 (2026-07-09)

- **수행**: 파트장(워크플로 실행·아티팩트 다운로드·Secret 교체) + Claude(복호화·psql 복원·검증)
- **백업**: Backup DB 수동 실행 2회 모두 green, 아티팩트 `db-backup-2026-07-09`(약 33KB, 암호화) 생성 확인
- **⚠️ 리허설이 발견한 문제**: 최초 `BACKUP_PASSPHRASE`를 분실(어디에도 기록 안 됨) — **분실 시 백업 전체 복원 불가**를 실제로 확인. 새 암구호로 Secret 교체 후 백업 재실행으로 해결. **교훈: 암구호는 반드시 비밀번호 관리자에 보관할 것** (분기 리허설 때마다 복호화 가능 여부 확인)
- **복호화**: `openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000` 성공 → schema(78KB)·data(106KB) 덤프 정상
- **과거 리허설 기록(현재 후보 SHA의 승인 증거 아님)**: 당시 테스트용 Supabase 프로젝트에서 schema → data 순 적용 결과 에러 0건. 당시 덤프에서 관찰된 managed `auth`/`storage` 객체 포함 여부는 현재 백업 계약이나 현재 후보의 복원 증거로 재사용하지 않는다. 현재 후보는 [RELEASE_EVIDENCE.md](./RELEASE_EVIDENCE.md)의 별도 복원 게이트를 다시 충족해야 한다.
- **행 수 검증(복원본)**: auth.users 10 / profiles 10 / allowed_users 11 / products 218 / product_assignments 198 / duties 25 / duty_assignments 21 / duty_major_categories 7 / activity_logs 2 — 운영 SQL Editor에서 동일 count 쿼리로 대조 가능
- **정리**: 복호화된 평문 덤프는 검증 직후 로컬에서 삭제(팀원 정보 포함). 테스트 프로젝트는 리허설 후 삭제 또는 pause 권장

---

## 10. 진행 체크리스트 (복사용)

```
[x] 0. Supabase 프로젝트(서울 ap-northeast-2) + CLI 설치 + 팀 공지 — 완료 (운영 배포됨)
[x] A. git push / PR merge + CI green (Deploy Worker green은 B 이후) — 완료
[x] B. GitHub Variables 3개 + Secrets 4개 (A보다 먼저 권장) — 완료 (배포·백업 워크플로 green으로 확인)
[x] C. Supabase migration ~202607080001 적용 + 확인 (서명 시점 29개) — 완료 (운영 반영됨; 30번째 202607090001은 "추가 배포 기록" 참조)
[x] D. leader 1명 + member 2명 계정 + Auth Site URL/Redirect + public sign-up OFF 재확인 — 완료 (파트원 온보딩, signup_disabled 라이브 확인)
[x] E. Workers 배포 + 스모크 + 보안 헤더(CSP) 확인 — 완료 (2026-07-09 라이브 점검: CSP 실적용·service_role 미노출 확인)
[x] F. RLS 검증 (TEST_PLAN.md) + must_change_password 차단 확인 — 2026-07-09 완료 (작업 F 검증 기록 참조)
[x] G. Backup DB run green + 복호화·복구 리허설 기록 — 2026-07-09 완료 (작업 G 검증 기록 참조)
```

**최종 서명**

| 항목 | 값 |
|------|-----|
| 완료일 | 2026-07-09 |
| 담당 | 파트장 |
| 운영 URL | `<WORKER_URL>` (public 저장소 관례상 실값 미기재) |
| Supabase project ref | `<PROJECT_REF>` (동일) |
| GitHub HEAD | 배포 코드 기준 6943176 (0~G 서명 당시. **이후 배포 이력은 아래 "추가 배포 기록" 절에 기록** — "이후 커밋은 문서뿐"이라는 이전 문구는 3f4c02b 배포로 무효) |
| Actions run ID | 29015812702 (Backup DB) |
| 비고 | 0~G 전부 완료. 2026-07-09 최종 배포 점검(빌드·라이브·인증/RLS·시크릿·문서) 통과 — 상세는 F·G 검증 기록. 첨부파일(Storage) 백업 규정은 **B안(백업 제외) 확정**(OPERATIONS.md) — 사용 규정 팀 공지만 남음 |

---

## 10.5 추가 배포 기록 (0~G 서명 이후)

### 2026-07-10 — 알림 패키지 (3f4c02b)

- **앱 코드**: 딥링크 공유·백그라운드 동기화(5분 폴링+창 복귀)·검토요청 Realtime 즉시 반영·파트장 데스크톱 알림. 2026-07-10 00:33 KST main push로 Deploy Worker 자동 배포(green) — 사후 감사에서 확인.
- **신규 migration `202607090001`** (30번째, Realtime publication — RLS 불변, 멱등):
  - [x] Actions → **DB Migrate**로 적용 완료 (run ID: 29061734389, 2026-07-10). 운영 이력에 Dashboard 경유 타임스탬프 버전 10개가 섞여 있어 첫 실행이 실패했고, repair 입력(타임스탬프 10개 `reverted` + 기적용 로컬 9개 `applied`)으로 이력 정정 후 202607090001 단독 적용 — realtime publication 검증 통과, 원격 이력 30개 = 로컬 30개 일치. 이후 마이그레이션은 repair 없이 DB Migrate 실행만으로 적용된다.
- **스모크 (파트장, 10분)**:
  - [ ] [TEST_PLAN.md](./TEST_PLAN.md) "알림·동기화" 5항목 수행
- **후속 정리**:
  - [x] Cloudflare autoconfig **PR #3 닫기** + Workers Builds Git 연동 해제 검증 완료. main `0b112c60`에는 `Workers Builds: sqap1workflow`와 GitHub Actions `deploy` check가 동시에 있었으나, PR #3를 disconnect 사유로 닫은 뒤 probe `ed3c5cb0`에는 GitHub Actions build/typecheck/lint/test/deploy만 존재하고 Workers Builds check가 생성되지 않음(2026-07-10).
  - [ ] 원격 브랜치 정리: `improve/sqa-p1-final-stabilization`(PR #2로 squash-merge됨), `cloudflare/workers-autoconfig`(PR 닫은 뒤)

---

## 11. 관련 문서

| 문서 | 용도 |
|------|------|
| [DEPLOYMENT.md](./DEPLOYMENT.md) | GitHub, Workers, Supabase 초기 설정 |
| [SUPABASE_MIGRATIONS.md](./SUPABASE_MIGRATIONS.md) | 마이그레이션 적용·확인 SQL |
| [OPERATIONS.md](./OPERATIONS.md) | 백업·장애·사용자 제거 런북 |
| [TEST_PLAN.md](./TEST_PLAN.md) | 기능·RLS 검증 시나리오 전체 |
