# Supabase 마이그레이션 적용

`supabase/migrations/` 디렉터리의 SQL 파일을 **파일명(타임스탬프) 순서대로** 적용합니다.

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

## Supabase CLI (권장)

```bash
# 프로젝트 연결 (최초 1회)
npx supabase login
npx supabase link --project-ref <PROJECT_REF>

# 원격 DB에 마이그레이션 적용
npx supabase db push
```

## SQL Editor (수동)

Dashboard > SQL Editor에서 위 **전체 migration 파일** 내용을 **순서대로** 실행합니다.  
`202607060002` 적용 전 [OPERATIONS.md](./OPERATIONS.md)의 제품명 중복 정리 절차를 따라 중복을 수동 병합하세요. 중복이 남아 있으면 migration이 실패합니다.

## 적용 전 DB 상태 확인

> **주의**: `supabase_migrations.schema_migrations` 이력은 CLI `db push`로 적용한 경우에만 기록됩니다. SQL Editor로 수동 적용했다면 이 테이블이 비어 있을 수 있으니, 아래 constraint·trigger·function 확인 쿼리로 적용 여부를 판단하세요.

```sql
-- migration 적용 이력 확인 (CLI db push 경로 전용)
select * from supabase_migrations.schema_migrations
where version in ('202607070004', '202607070005', '202607080001');

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

| DB 상태 | 조치 |
|---|---|
| 060002 **미적용** | 중복 병합 후 `db push` — 정상 경로 |
| 060002 **적용됨**(구버전 delete 포함), 060003 미적용 | delete가 이미 실행됐을 수 있음 → 백업·audit 확인 후 060003 적용 |
| 둘 다 적용됨 | forward-fix 불필요. audit 테이블로 영향 조사 |

## 적용 확인

```sql
select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'profiles' and column_name = 'is_active';

select id from storage.buckets where id = 'review-attachments';

select proname from pg_proc
where pronamespace = 'public'::regnamespace
  and proname in (
    'reject_review_request',
    'add_review_feedback',
    'create_project_with_assignments',
    'replace_project_assignments',
    'replace_product_assignments',
    'replace_duty_assignments',
    'update_review_request_status'
  );

-- 202607080001: 비밀번호 변경 전 접근 차단이 can_use_app()/is_active_leader()에 반영됐는지
select pg_get_functiondef('public.can_use_app()'::regprocedure) like '%password_is_current%' as can_use_app_guarded,
       pg_get_functiondef('public.is_active_leader()'::regprocedure) like '%password_is_current%' as is_active_leader_guarded;

-- 202607080001: 파트장 이름 view가 다시 owner 권한으로 조회되는지 (member 가시성 복구)
select reloptions from pg_class where relname = 'public_leader_profiles';
```

## 로컬 검증

마이그레이션 텍스트 회귀 테스트:

```bash
npm test -- src/migrations.test.ts
```
