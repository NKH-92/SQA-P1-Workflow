# 직접 수행 작업 계획서 (Manual Tasks Plan)

> **대상**: 파트장 또는 지정 운영자  
> **목적**: 코드·CI 작업(Phase 1~4) 완료 후, **운영 환경에 반영하고 검증**하기 위해 사람이 직접 해야 하는 작업을 순서대로 정리한다.  
> **전제**: 브랜치 `main`, HEAD `572bcfb`(또는 이후) — `npm test` 42 passed, `npm run build` 성공 상태.

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
| **H** | Cloudflare Access (필수) | 운영자 | 30분 | E 이후 |

**권장 일정 (1일 집중)**  
오전: A → B → C → D → E → H / 오후: F → G

---

## 2. 작업 A — Git push 및 CI 확인

### 목표
로컬 `main`의 개선 사항을 원격에 반영하고, GitHub Actions 4 job(typecheck / lint / test / build)이 통과하는지 확인한다.

### 절차

1. 로컬 상태 확인
   ```bash
   git status          # clean 확인
   git log -2 --oneline
   ```

2. 원격 push (`main`이 protected이면 PR 또는 관리자 승인 필요)
   ```bash
   git push origin main
   ```
   Protected branch인 경우:
   ```bash
   git checkout -b release/phase-1-4
   git push -u origin release/phase-1-4
   gh pr create --title "Phase 1-4 improvement release" --body "See docs/MANUAL_TASKS_PLAN.md"
   ```

3. CI 결과 확인
   ```bash
   gh run list --limit 5
   gh run watch   # 최신 run ID 지정
   ```
   **통과 기준**: `typecheck`, `lint`, `test`, `build` 모두 green.

### 완료 기준
- [ ] 원격 `main`(또는 merge된 PR)에 최신 커밋 반영
- [ ] CI 4 job 전부 성공

### 실패 시
| 증상 | 조치 |
|------|------|
| lint/test 실패 | Actions 로그 확인 → 로컬에서 `npm run lint`, `npm test` 재현 후 수정 |
| push 거부 | branch protection 규칙 확인 → PR 경로 사용 |

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
| `WORKER_NAME` | 배포할 Worker 이름 (예: `part-ops`) | |
| `VITE_SUPABASE_URL` | Supabase → Settings → API → Project URL | `https://xxxx.supabase.co` |

### Secrets (민감)

| 이름 | 값 출처 | 금지 |
|------|---------|------|
| `VITE_SUPABASE_ANON_KEY` | Supabase → Settings → API → anon public | service_role 키 **사용 금지** |
| `CLOUDFLARE_API_TOKEN` | Cloudflare → My Profile → API Tokens (Workers Edit) | |

### 확인
- [ ] Variables 3개, Secrets 2개 등록 완료
- [ ] `git grep`으로 저장소에 URL/키/계정 ID가 **없음** (이미 D-1 완료 상태 유지)

### 완료 기준
- [ ] `workflow_dispatch` 또는 main push 후 deploy 워크플로가 **skip 없이** 실행됨 (Secrets 미설정 시 deploy는 스킵됨)

---

## 4. 작업 C — Supabase 마이그레이션 적용

### 목표
Phase 2~4에서 추가된 DB·Storage·RLS 변경을 **운영(또는 스테이징) Supabase**에 반영한다.

### 미적용 시 영향

| 미적용 마이그레이션 | 증상 |
|---------------------|------|
| `202607050001_...` | 파트원 검토요청 수정·회수 → RLS 오류 |
| `202607050002_...` | 파일 첨부 업로드/다운로드 실패 |
| `202607050003_...` | `is_active` 비활성화 UI·RLS 미동작 |
| `202607050004_...` | 비활성 계정이 기존 데이터·Storage에 접근 가능 |
| `202607050005_...` | RPC 트랜잭션·첨부 경로 검증 미적용 → 부분 실패·경로 우회 위험 |

### 방법 1 — Supabase CLI (권장)

```bash
# 최초 1회
npx supabase login
npx supabase link --project-ref <PROJECT_REF>   # Dashboard URL의 ref

# 전체 마이그레이션 push (아직 안 올라간 것만 적용)
npx supabase db push
```

`PROJECT_REF`: Supabase Dashboard URL `https://supabase.com/dashboard/project/<PROJECT_REF>`

### 방법 2 — SQL Editor (수동)

Dashboard → **SQL Editor**에서 아래 파일 내용을 **번호 순서대로** 각각 실행:

1. `supabase/migrations/202607050001_member_review_update_delete.sql`
2. `supabase/migrations/202607050002_review_attachments_storage.sql`
3. `supabase/migrations/202607050003_profile_is_active.sql`
4. `supabase/migrations/202607050004_harden_active_access_rls.sql`
5. `supabase/migrations/202607050005_atomic_mutations_and_attachment_guard.sql`

> 이미 적용된 초기 마이그레이션(`20260702*`, `20260704*`)은 **다시 실행하지 않는다.**

### 적용 후 확인 SQL

```sql
-- is_active 컬럼
select column_name, data_type, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'profiles' and column_name = 'is_active';

-- Storage 버킷
select id, file_size_limit from storage.buckets where id = 'review-attachments';

-- member pending 수정 정책 존재 여부 (pg_policies)
select policyname from pg_policies
where tablename = 'review_requests' and policyname like '%self_pending%';

-- RPC 트랜잭션 함수 (005)
select proname from pg_proc
where pronamespace = 'public'::regnamespace
  and proname in ('reject_review_request', 'add_review_feedback', 'create_project_with_assignments');
```

### 완료 기준
- [ ] 위 4개 확인 쿼리 결과 정상
- [ ] 로컬 `npm test -- src/migrations.test.ts` 통과 (텍스트 회귀 — 선택)

### 실패 시
| 증상 | 조치 |
|------|------|
| policy already exists | 해당 `create policy`만 `drop policy if exists` 후 재실행 |
| storage bucket conflict | 마이그레이션의 `on conflict do update` 구문 확인 |
| link 실패 | Supabase 프로젝트 권한·ref 재확인 |

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

### 5.2 계정 생성

| 계정 | 방법 |
|------|------|
| 파트장 | 앱 가입 또는 Dashboard → Authentication → Add user |
| member A, B | `allowed_users` 등록 후 각자 가입 |

### 5.3 Auth 설정 확인

Supabase → **Authentication → URL Configuration**

| 항목 | 값 |
|------|-----|
| Site URL | Workers 배포 URL (예: `https://part-ops.<account>.workers.dev`) |
| Redirect URLs | 위 URL + 로컬 dev `http://localhost:5173` (개발 시) |

### 5.4 첫 로그인

1. 임시 비밀번호로 로그인 (최소 4자, `'1234'`는 앱에서 거부)
2. `must_change_password` 화면에서 **8자 이상**으로 변경
3. 파트장 홈·마스터 탭 진입 확인

### 완료 기준
- [ ] `profiles`에 leader 1명, member 2명 존재
- [ ] 파트장 `canManageTeamData` 화면(마스터 탭) 접근 가능
- [ ] 파트원은 leader 전용 탭 접근 불가

---

## 6. 작업 E — Workers 배포 및 앱 스모크

### 목표
운영 URL에서 빌드된 앱이 Supabase와 연결되어 동작하는지 확인한다.

### 자동 배포
작업 B 완료 후 `main` push 또는 Actions → **deploy-worker** → `workflow_dispatch`

### 수동 배포 (대안)

```powershell
cd "E:\99.Codex Project\P1 Work"
npm ci
npm test
$env:VITE_SUPABASE_URL="https://xxxx.supabase.co"
$env:VITE_SUPABASE_ANON_KEY="eyJ..."
npm run build
npx wrangler deploy --name <WORKER_NAME> --assets dist
```

### 스모크 체크리스트 (15분)

데모 모드가 **아닌** Supabase 연결 URL에서:

| # | 확인 | 기대 |
|---|------|------|
| 1 | 로그인 | 파트장 홈 표시 |
| 2 | 검토요청 생성 | `pending` 상태, 목록 반영 |
| 3 | 해시 URL | `#/reviews?id=<uuid>` 새로고침 후 동일 항목 선택 |
| 4 | 마스터 > 제품 CSV 가져오기 | 중복 없이 등록 |
| 5 | 활동 로그 탭 | leader만 전체 목록 |
| 6 | (선택) 파일 첨부 | 10MB 이하 PDF 업로드 → `첨부 열기` |

### 완료 기준
- [ ] 운영 URL 접속·로그인·CRUD 1회 이상 성공
- [ ] 브라우저 콘솔에 Supabase 401/403 연속 오류 없음

---

## 7. 작업 F — RLS 및 권한 수동 검증

### 목표
`docs/TEST_PLAN.md` RLS 섹션을 **3계정**으로 재현해 데이터 격리를 확인한다.

### 준비
- 브라우저 프로필 3개(또는 시크릿 창) — leader / member A / member B
- Supabase Dashboard → Logs (API) 켜두고 거부(403) 로그 확인

### 검증 매트릭스

#### F-1. Member 간 격리 (member A 세션)

| 시도 | 기대 |
|------|------|
| member B 이름으로 검색·목록 조회 | B의 배정/검토요청 **미노출** |
| SQL/API로 B의 `review_requests` id 직접 접근 | 불가 (앱에서는 목록에 없음으로 확인) |

#### F-2. Member → Master 쓰기 금지

member A로 앱에서 불가능한지 확인 (UI에 버튼 없음 = 1차 방어).  
Dashboard SQL Editor에서 member JWT로 테스트하거나, 앱 네트워크 탭에서 403 확인.

#### F-3. 검토요청 lifecycle

| 역할 | 동작 | 기대 |
|------|------|------|
| member A | 본인 `pending` 요청 수정·회수 | 성공 |
| member A | `in_review` 요청 수정 | UI 버튼 없음 / RLS 거부 |
| member A | member B `pending` 수정 | 거부 |
| leader | 반려 시 사유 없이 반려 | UI 차단 |
| leader | 반려 + 피드백 | member A 화면에 표시 |

#### F-4. 프로젝트

| 동작 | 기대 |
|------|------|
| leader 배정 편집·프로젝트 삭제 | 성공, member 화면 반영 |
| member 프로젝트 수정 시도 | 불가 |
| leader를 project_assignments에 배정 | DB trigger 거부 |

#### F-5. Storage (`review-attachments`)

| 동작 | 기대 |
|------|------|
| member A 본인 경로 업로드 | 성공 |
| member A가 member B 파일 URL 접근 | 거부 |
| leader 모든 첨부 조회 | 성공 |

#### F-6. `is_active` 비활성화

1. leader → 마스터 → 초대 관리 → member A **비활성화**
2. member A 로그인 → **「계정이 비활성화되었습니다」** 화면
3. leader → **활성화** → member A 정상 진입

### 기록

검증 완료 후 아래 표를 채운다 (`docs/OPERATIONS.md` 또는 팀 위키).

| 날짜 | 검증자 | 환경(URL) | F-1~F-6 | 비고 |
|------|--------|-----------|:-------:|------|
| | | | ☐ / ☐ / ☐ / ☐ / ☐ / ☐ | |

### 완료 기준
- [ ] TEST_PLAN RLS 항목 **전체** 통과
- [ ] 실패 0건, 또는 실패 항목·조치 기록

---

## 8. 작업 G — 백업 및 복구 리허설

### 목표
주 1회 백업 절차를 **1회 실행**하고, 분기 리허설을 **1회** 수행해 복구 가능함을 기록한다.

### G-1. 백업 (주간)

**담당**: 파트장 또는 지정 운영자  
**주기**: 매주 1회 (권장: 일요일)

#### PowerShell

```powershell
cd "E:\99.Codex Project\P1 Work"
.\scripts\backup-db.ps1 -DatabaseUrl "postgresql://postgres.[ref]:[PASSWORD]@aws-0-ap-northeast-2.pooler.supabase.com:6543/postgres"
```

또는 Supabase CLI:

```bash
supabase db dump --db-url "<DATABASE_URL>" -f backup/part-ops-YYYY-MM-DD.sql
```

#### 보관 규칙
- 경로: `backup/` (로컬) 또는 사내 NAS — **`.gitignore`로 `backup/*.sql` 제외됨**
- 공개 저장소·이메일·Slack 파일 업로드 **금지** (개인정보 포함)

#### 확인
- [ ] 파일 크기 > 0
- [ ] 파일 상단에 `PostgreSQL` / `pg_dump` 헤더 존재

### G-2. 복구 리허설 (분기 1회)

1. **스테이징** Supabase 프로젝트(또는 로컬 Postgres) 준비
2. 최신 `backup/part-ops-YYYY-MM-DD.sql` 복원
   ```bash
   psql "<STAGING_DATABASE_URL>" -f backup/part-ops-YYYY-MM-DD.sql
   ```
3. 행 수 대조 (운영 vs 스테이징):
   ```sql
   select 'profiles' as t, count(*) from profiles
   union all select 'review_requests', count(*) from review_requests
   union all select 'products', count(*) from products;
   ```
4. 스테이징 URL 또는 로컬에서 로그인 스모크 1회

### 기록 (`docs/OPERATIONS.md`)

| 날짜 | 담당 | 백업 파일 | 크기 | 복구 리허설 |
|------|------|-----------|------|:-----------:|
| YYYY-MM-DD | | backup/part-ops-....sql | MB | ☐ 성공 / ☐ 실패 |

### 완료 기준
- [ ] 백업 파일 1개 이상 보관
- [ ] 복구 리허설 1회 성공 기록

---

## 9. 작업 H — Cloudflare Access (필수)

내부 전용 배포에서는 Worker URL을 **반드시** Cloudflare Access 뒤에 둔다. Access 없이 공개 URL을 두면 anon key만으로 로그인 화면에 접근할 수 있다.

### Cloudflare Access
- Worker URL 앞단에 Access policy 적용 → 팀 이메일 도메인만 허용
- Access는 **URL 게이트**; 앱 내부 권한은 Supabase RLS가 담당

### Supabase 무료 티어 점검
- Dashboard → Settings → Database → 용량
- Storage → `review-attachments` 사용량 (무료 1GB 한도)
- Pro 전환 검토 시점: [DEPLOYMENT.md](./DEPLOYMENT.md) 「Supabase Pro 전환 기준」

---

## 10. 일상 운영 (배포 후)

| 주기 | 작업 | 문서 |
|------|------|------|
| 매주 | DB 백업 | [OPERATIONS.md](./OPERATIONS.md) |
| 분기 | 복구 리허설 | 위 G-2 |
| 수시 | 퇴사·이동 | 초대 삭제 **또는** `is_active` 비활성화 + (필요 시) Auth Users 삭제 |
| 수시 | 장애 | OPERATIONS 「장애 확인 순서」 |

### 사용자 제거 의사결정

| 상황 | 권장 |
|------|------|
| 일시 접근 차단 | 마스터 → **비활성화** |
| 완전 삭제 | Auth Users 삭제 → profiles cascade |
| 초대만 취소 (미가입) | `allowed_users` 삭제 |

---

## 11. 관련 문서

| 문서 | 용도 |
|------|------|
| [DEPLOYMENT.md](./DEPLOYMENT.md) | GitHub, Workers, Supabase 초기 설정 |
| [SUPABASE_MIGRATIONS.md](./SUPABASE_MIGRATIONS.md) | 마이그레이션 적용·확인 SQL |
| [OPERATIONS.md](./OPERATIONS.md) | 백업·장애·사용자 제거 런북 |
| [TEST_PLAN.md](./TEST_PLAN.md) | 기능·RLS 검증 시나리오 전체 |
| [IMPROVEMENT_PLAN.md](./IMPROVEMENT_PLAN.md) | 개선 계획 배경·Phase 정의 |

---

## 12. 진행 체크리스트 (복사용)

```
[ ] A. git push / PR merge + CI green
[ ] B. GitHub Variables/Secrets 5개
[ ] C. Supabase migration x5 적용 + 확인 SQL
[ ] D. leader + member A/B 계정 + Auth URL
[ ] E. Workers 배포 + 스모크 6항목
[ ] F. RLS 검증 F-1 ~ F-6
[ ] G. 백업 1회 + 복구 리허설 기록
[ ] H. Cloudflare Access (필수)
```

**최종 서명**

| 항목 | 값 |
|------|-----|
| 완료일 | |
| 담당 | |
| 운영 URL | |
| Supabase project ref | |
| 비고 | |
