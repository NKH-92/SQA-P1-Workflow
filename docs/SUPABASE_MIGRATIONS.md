# Supabase 마이그레이션 적용

Phase 2~4에서 추가된 마이그레이션:

| 파일 | 내용 |
|------|------|
| `202607050001_member_review_update_delete.sql` | 검토요청 수정·회수 |
| `202607050002_review_attachments_storage.sql` | Storage 첨부 버킷 |
| `202607050003_profile_is_active.sql` | `is_active` 비활성화 |
| `202607050004_harden_active_access_rls.sql` | 비활성 계정 RLS 전면 적용 |
| `202607050005_atomic_mutations_and_attachment_guard.sql` | RPC 트랜잭션 + 첨부 경로 검증 |

## Supabase CLI (권장)

```bash
# 프로젝트 연결 (최초 1회)
npx supabase login
npx supabase link --project-ref <PROJECT_REF>

# 원격 DB에 마이그레이션 적용
npx supabase db push
```

## SQL Editor (수동)

Dashboard > SQL Editor에서 위 5개 파일 내용을 **순서대로** 실행합니다.

## 적용 확인

```sql
select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'profiles' and column_name = 'is_active';

select id from storage.buckets where id = 'review-attachments';

select proname from pg_proc
where pronamespace = 'public'::regnamespace
  and proname in ('reject_review_request', 'add_review_feedback', 'create_project_with_assignments');
```

## 로컬 검증

마이그레이션 텍스트 회귀 테스트:

```bash
npm test -- src/migrations.test.ts
```
