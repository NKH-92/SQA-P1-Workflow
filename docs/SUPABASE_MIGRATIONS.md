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
| `202607060002_p1_product_unique_and_assignment_rpcs.sql` | 제품명 unique(중복 자동 삭제 포함) + product/duty 배정 RPC |
| `202607060003_audit_product_duplicates.sql` | 중복 제품 감사 + fail-fast unique constraint |
| `202607060004_review_status_transitions.sql` | 검토 상태 전이 RPC 강제 (`pending` → `approved`/`rejected`만) |
| `202607060005_storage_only_attachments.sql` | 검토 첨부 Storage URL만 허용 |
| `202607060006_public_leader_profiles.sql` | 파트원용 파트장 이름 view |

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
`202607060002`는 중복 제품을 자동 삭제할 수 있으므로, 운영 DB 적용 전 [OPERATIONS.md](./OPERATIONS.md)의 제품명 중복 정리 절차를 확인하세요.

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
```

## 로컬 검증

마이그레이션 텍스트 회귀 테스트:

```bash
npm test -- src/migrations.test.ts
```
