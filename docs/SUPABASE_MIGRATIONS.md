# Supabase 마이그레이션 적용

`supabase/migrations/` 디렉터리의 SQL 파일을 **파일명(타임스탬프) 순서대로** 적용합니다.

## 정책 (append-only)

- 마이그레이션은 **불변 이력**입니다. 스키마·RLS 변경은 반드시 **새 파일 추가**로 하고, 이미 적용된 파일은 수정·이름 변경·병합(squash)하지 않습니다 — DB의 적용 이력과 어긋나게 됩니다.
- 새 마이그레이션을 추가하면 `src/migrations.test.ts`의 텍스트 회귀 테스트를 함께 갱신합니다.

| 파일 | 내용 |
|------|------|
| `202607020001_initial_schema.sql` | 초기 스키마 |
| `202607020002_remove_project_assignment_allocation.sql` | 프로젝트 배정 allocation 컬럼 제거 |
| `202607020003_add_profile_notes.sql` | 프로필 메모 |
| `202607020004_backfill_profiles_from_allowed_users.sql` | allowed_users → profiles 백필 |
| `202607040001_require_password_change.sql` | 첫 로그인 비밀번호 변경 |
| `202607040002_harden_role_invariants.sql` | 역할 불변 trigger/RLS |
| `202607040003_operational_queue.sql` | 운영 큐 |
| `202607050001_member_review_update_delete.sql` | 검토요청 수정·회수 |
| `202607050002_review_attachments_storage.sql` | Storage 첨부 버킷 |
| `202607050003_profile_is_active.sql` | `is_active` 비활성화 |
| `202607050004_harden_active_access_rls.sql` | 비활성 계정 RLS 전면 적용 |
| `202607050005_atomic_mutations_and_attachment_guard.sql` | RPC 트랜잭션 + 첨부 경로 검증 |
| `202607050006_product_allocation_metadata.sql` | 제품 배정 메타데이터 |
| `202607050007_remove_in_review_status.sql` | `in_review` 제거, 3단계 상태(`pending/approved/rejected`) |
| `202607050008_remove_product_code_and_assignment_status.sql` | 제품 코드·배정 상태 제거 |
| `202607050009_duty_major_categories.sql` | 업무 대분류 |
| `202607050010_duty_allocation_metadata.sql` | 업무 배정 메타데이터 |
| `202607060001_p0_atomic_assignments_and_review_status.sql` | 프로젝트 배정 RPC + 검토 상태 RPC |
| `202607060002_p1_product_unique_and_assignment_rpcs.sql` | 제품명 unique(fail-fast) + product/duty 배정 RPC |
| `202607060003_audit_product_duplicates.sql` | 중복 제품 감사 기록 + fail-fast unique constraint |
| `202607060004_review_status_transitions.sql` | 검토 상태 전이 RPC 강제 (`pending` → `approved`/`rejected`만) |
| `202607060005_storage_only_attachments.sql` | 검토 첨부 Storage URL만 허용 |
| `202607060006_public_leader_profiles.sql` | 파트원용 파트장 이름 view |
| `202607070001_harden_audit_rls_and_revoke_anon_rpc.sql` | audit RLS + view invoker + anon RPC revoke |
| `202607070002_revoke_public_execute_on_internal_helpers.sql` | PUBLIC execute revoke on internal helper RPCs |
| `202607070003_revoke_public_execute_on_mutation_rpcs.sql` | PUBLIC execute revoke on mutation RPCs (authenticated only) |
| `202607070004_extend_activity_log_entity_types.sql` | activity_logs entity_type check에 product/duty/duty_major_category 추가 |
| `202607070005_protect_last_active_leader.sql` | 마지막 active leader 비활성화·강등 방지 |
| `202607080001_enforce_password_change_and_restore_visibility.sql` | 비밀번호 변경 전 데이터 접근 RLS 차단 + 파트장 이름 view 복구 + last-leader counter 잠금 |
| `202607090001_realtime_review_requests.sql` | 검토요청 Realtime 발행 (신규·재요청 파트장 브라우저 알림용, RLS 불변) |
| `202607110001_add_single_assignment_rpcs.sql` | 단건 제품·업무 배정을 스냅샷 전체 교체가 아닌 add-only RPC로 분리 |
| `202607110002_require_member_for_assignments.sql` | 모든 제품·업무 배정 쓰기 경로에 active member 불변식 강제 |
| `202607110003_gate_public_leader_profiles.sql` | owner view의 파트장 이름 노출을 현재 app 접근 가능 계정으로 제한 |
| `202607110004_restrict_review_status_and_audit.sql` | 검토 상태를 RPC 전용으로 제한하고 private 원자적 상태 변경 이력 기록 |
| `202607110005_private_mutation_audit.sql` | 핵심 master·배정·검토·프로젝트 변경을 private 트리거 감사 이력에 원자적으로 기록 |
| `202607110006_serialize_last_leader_guard.sql` | 동시 강등·비활성화 검사를 advisory transaction lock으로 직렬화 |
| `202607110007_serialize_project_assignment_replace.sql` | Project assignment replacement with `updated_at` optimistic concurrency |
| `202607110008_reopen_review_requests.sql` | Leader-only reopen RPC for closed review requests with transactional audit |
| `202607110009_harden_review_member_and_project_assignment_paths.sql` | Password-gated member write closure, feedback author scope, and project OCC invalidation |
| `202607110010_atomic_review_activity_logs.sql` | Review status and feedback RPC activity logs committed in the same transaction |
| `202607110011_add_profile_note_private_audit.sql` | Transaction-bound private audit trigger for profile-note mutations |
| `202607120001_revoke_anon_from_add_assignment_rpcs.sql` | add-only 배정 RPC와 파트장 이름 view의 잔여 anon 권한 회수 |
| `202607120002_drop_role_only_leader_write_policies.sql` | active/password 검증 없는 구형 leader 쓰기 정책 제거 |
| `20260714075451_leader_ui_improvements.sql` | 제품 미지정 사유 원자적 저장·배정 시 자동 삭제 + 현재 활성 파트장 본인 프로젝트 배정 허용 |
| `20260714082821_optimize_leader_project_assignment_rls.sql` | 파트장 본인 프로젝트 배정 RLS의 사용자 ID 평가를 쿼리당 1회로 최적화 |
| `20260715013615_review_resubmission_history.sql` | 반려 요청의 동일-ID 재요청, 회차·반려 횟수·작성자 역할 이력, 원자적 `resubmit_review_request` RPC |

## Supabase CLI (권장)

```bash
# 프로젝트 연결 (최초 1회)
npx supabase login
npx supabase link --project-ref <PROJECT_REF>

# 원격 DB에 마이그레이션 적용
npx supabase db push
```

이 직접 명령은 운영 정규 경로가 아니라 break-glass 절차입니다. 운영 반영은 보호된 **Actions → DB Migrate**를 사용하고, 직접 실행이 불가피하면 동일한 사전 백업·프로젝트 식별·사후 readiness 증거와 승인 기록을 남깁니다.

push와 핵심 객체(RPC·Storage 버킷·RLS 정책) 존재 확인을 한 번에 하려면 `scripts/apply-pending-migrations.ps1`을 사용합니다.

## GitHub Actions — DB Migrate (로컬 인증 없이)

로컬에 Supabase 로그인이나 DB 비밀번호가 없어도, Actions → **DB Migrate** → Run workflow로 미적용 마이그레이션을 적용할 수 있습니다. Migration-only 변경을 `main`에 반영한 뒤 같은 `main` SHA에서 **Backup DB**를 schedule 또는 수동 실행하고, 24시간 이내 성공한 run ID를 DB Migrate에 입력해야 합니다. workflow·event(schedule/수동)·branch·commit SHA·성공 상태·암호화 artifact를 모두 확인하며 하나라도 다르면 DB 접속 전에 실패합니다. 비-main ref도 Secret 확인·DB 접근 전에 실패합니다. 백업과 동일한 `SUPABASE_DB_URL` Secret을 사용하며, Job Summary에 적용 결과와 realtime publication 확인이 표시됩니다. append-only 정책 그대로 — 이 워크플로도 새 파일만 push합니다.

`202607110001` 이후 프런트는 신규 add-only RPC를 호출합니다. 짧은 유지보수 창을 공지하고 기존 탭을 새로고침/종료한 뒤, 직전 백업 → DB Migrate → 신규 버전과 RPC 보안 속성·ACL 확인 → 프런트 배포 순으로 진행합니다. 완전 무중단 공존 증명은 선택사항이지만 두 단계를 한 번의 `main` 병합으로 합치지는 않습니다.

## SQL Editor (수동)

Dashboard > SQL Editor에서 위 **전체 migration 파일** 내용을 **순서대로** 실행합니다.  
`202607060002` 적용 전 [OPERATIONS.md](./OPERATIONS.md)의 제품명 중복 정리 절차를 따라 중복을 수동 병합하세요. 중복이 남아 있으면 migration이 실패합니다.

## 적용 전 DB 상태 확인

> **주의**: `supabase_migrations.schema_migrations` 이력은 CLI `db push`로 적용한 경우에만 기록됩니다. SQL Editor로 수동 적용했다면 이 테이블이 비어 있을 수 있으니, 아래 constraint·trigger·function 확인 쿼리로 적용 여부를 판단하세요.

```sql
-- migration 적용 이력 확인 (CLI db push 경로 전용)
-- 최신 버전이 로컬 supabase/migrations/의 마지막 파일과 같아야 합니다
select max(version) from supabase_migrations.schema_migrations;

-- activity_logs entity_type check includes master delete types
select pg_get_constraintdef(oid)
from pg_constraint
where conrelid = 'public.activity_logs'::regclass
  and conname = 'activity_logs_entity_type_check';

-- last active leader guard triggers
select tgname
from pg_trigger
where tgrelid in ('public.profiles'::regclass, 'public.allowed_users'::regclass)
  and tgname like '%last_active_leader%';

-- 현재 중복 제품 확인
select name, count(*) from public.products group by name having count(*) > 1;

-- audit 테이블 존재 여부
select exists (
  select 1 from information_schema.tables
  where table_schema = 'public' and table_name = 'product_dedup_audit'
);
```

중복 제품이 있으면 `202607060002`가 실패하므로, 적용 전에 [OPERATIONS.md](./OPERATIONS.md)의 제품명 중복 정리 절차로 수동 병합합니다.

## 적용 확인

```sql
select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'profiles' and column_name = 'is_active';

select id from storage.buckets where id = 'review-attachments';

select proname from pg_proc
where pronamespace = 'public'::regnamespace
  and proname in (
    'reject_review_request',
    'resubmit_review_request',
    'add_review_feedback',
    'create_project_with_assignments',
    'replace_project_assignments',
    'replace_product_assignments',
    'replace_product_assignments_with_reason',
    'replace_duty_assignments',
    'update_review_request_status'
  );

-- 202607080001: 비밀번호 변경 전 접근 차단이 can_use_app()/is_active_leader()에 반영됐는지
select pg_get_functiondef('public.can_use_app()'::regprocedure) like '%password_is_current%' as can_use_app_guarded,
       pg_get_functiondef('public.is_active_leader()'::regprocedure) like '%password_is_current%' as is_active_leader_guarded;

-- 202607080001: 파트장 이름 view가 다시 owner 권한으로 조회되는지 (member 가시성 복구)
select reloptions from pg_class where relname = 'public_leader_profiles';

-- 202607090001: review_requests가 realtime publication에 포함됐는지
select exists (
  select 1 from pg_publication_tables
  where pubname = 'supabase_realtime'
    and schemaname = 'public'
    and tablename = 'review_requests'
);

-- 20260714075451: 제품 미지정 사유와 자동 정리 trigger
select column_name
from information_schema.columns
where table_schema = 'public'
  and table_name = 'products'
  and column_name = 'unassigned_reason';

select tgname
from pg_trigger
where tgrelid in ('public.products'::regclass, 'public.product_assignments'::regclass)
  and tgname in ('products_validate_unassigned_reason', 'product_assignments_clear_unassigned_reason');

select pg_get_functiondef('public.validate_project_assignment_member()'::regprocedure)
  like '%new.user_id = auth.uid()%' as current_leader_self_allowed;

-- 20260715013615: 동일 요청 재요청 이력과 RPC
select column_name
from information_schema.columns
where table_schema = 'public'
  and table_name = 'review_requests'
  and column_name in ('review_round', 'rejection_count', 'last_submitted_at');

select column_name
from information_schema.columns
where table_schema = 'public'
  and table_name = 'review_feedback'
  and column_name = 'author_role';

select has_function_privilege('authenticated', 'public.resubmit_review_request(uuid, text)', 'execute')
  as authenticated_can_resubmit;
```

## 로컬 검증

마이그레이션 텍스트 회귀 테스트:

```bash
npm test -- src/migrations.test.ts
```

## 20260716200422 announcement board

`20260716200422_create_announcements_board.sql` adds the announcement board,
pinned ordering, active-leader-only writes, explicit Data API grants, immutable
creation fields, and the private mutation-audit trigger.

```sql
select to_regclass('public.announcements') is not null as announcements_exists,
       coalesce((
         select relrowsecurity
         from pg_class
         where oid = to_regclass('public.announcements')
       ), false) as announcements_rls_enabled;

select conname, pg_get_constraintdef(oid)
from pg_constraint
where conrelid = to_regclass('public.announcements')
  and conname in (
    'announcements_title_length_check',
    'announcements_body_length_check',
    'announcements_pin_state_check'
  );

select policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename = 'announcements'
order by policyname;

select has_table_privilege('authenticated', 'public.announcements', 'select') as authenticated_select,
       has_table_privilege('authenticated', 'public.announcements', 'delete') as authenticated_delete,
       has_table_privilege('authenticated', 'public.announcements', 'insert') as authenticated_table_insert,
       has_column_privilege('authenticated', 'public.announcements', 'title', 'insert') as authenticated_title_insert,
       has_column_privilege('authenticated', 'public.announcements', 'pinned_at', 'update') as authenticated_pinned_at_update,
       has_table_privilege('anon', 'public.announcements', 'select') as anon_select;

select tgname
from pg_trigger
where tgrelid = to_regclass('public.announcements')
  and tgname in (
    'announcements_enforce_invariants',
    'announcements_set_updated_at',
    'announcements_private_audit'
  )
order by tgname;
```
