# 검토 워크플로 하드닝 운영 런북

이 릴리스는 되돌릴 수 있는 Stage A와, 운영 Storage가 비었음을 사람이 확인한 뒤에만 적용하는 Stage B로 분리한다. 기존 마이그레이션 파일은 수정하지 않는다.

## Stage A — 비파괴 전환

1. `Backup DB`를 `main`에서 실행하고 암호화 백업 artifact와 run ID를 확인한다.
2. `DB Migrate`에 해당 backup run ID를 전달한다.
3. 다음 readiness 쿼리를 확인한다.
   - `review_events`, `review_read_receipts`가 존재하고 RLS가 켜져 있다.
   - `mark_password_changed()`는 플래그를 변경하지 않고 Auth 트리거가 관찰한 결과만 반환한다.
   - 리뷰 생성·수정·승인·반려·재요청·회수·피드백 수정·무효화 RPC가 `authenticated`에만 열려 있다.
4. `Deploy Worker`를 `main`, `deploy_confirm=true`, 방금 성공한 동일 SHA의 `ci_run_id`와 `db_migrate_run_id`로 실행하고 root mount 및 보안 헤더 healthcheck 완료까지 기다린다.
5. 브라우저에서 신규 검토 작성 화면에 파일 선택/링크가 없고 별도 메신저 안내만 보이는지 확인한다.

Stage A 동안 기존 `attachment_url`, Storage bucket, Storage 정책은 호환 목적으로 유지되지만 앱은 새 첨부를 만들거나 읽지 않는다.

## 운영자 Storage purge 장벽

서비스 역할 키는 로컬 셸의 환경 변수로만 주입하며 저장하거나 로그에 출력하지 않는다.

```powershell
$env:SUPABASE_URL = '<production project URL>'
$env:SUPABASE_SERVICE_ROLE_KEY = '<ephemeral service-role key>'
npm run ops:attachments:dry-run
```

기본 출력에는 파일명이 없으며 대상 URL/project ref, `bucket`, `bucketExists`, `objectCount`, `totalBytes`, `nameDigestSha256`만 표시된다. 필요하면 `--output=ops-output/review-attachments-dry-run.json`으로 비밀값이나 파일명 없는 JSON 기록을 남긴다. 파일명 확인이 승인된 경우에만 `--verbose`를 추가한다.

dry-run 결과를 변경 기록에 남기고 보존 정책과 승인자를 확인한 운영자만 다음을 실행한다. 실행 결과도 저장하려면 동일하게 `--output=ops-output/review-attachments-execute.json`을 추가한다.

```powershell
node scripts/purge-review-attachments.mjs --execute --confirm=PURGE_REVIEW_ATTACHMENTS
```

성공 기준은 마지막 JSON의 `failedObjectCount`와 `verifiedRemainingObjectCount`가 모두 `0`이고 `verifiedBucketAbsent=true`, `bucketExistsAfter=false`인 것이다. `bucketAlreadyAbsent=true` 또는 `bucketDeleteAttempted=false`면 누가 먼저 삭제했는지 변경 기록을 대조해 별도 승인한다. 일부 batch가 실패하거나 빈 bucket의 Storage API 삭제·부재 검증이 실패하면 스크립트는 exit code 1로 종료한다. 키가 셸에 있는 동안 같은 dry-run을 다시 실행해 `bucketExists=false`, `objectCount=0`을 별도 기록한 다음 키를 제거하고 Stage B를 진행한다. Codex 자동화는 execute 단계를 수행하지 않는다. 상세 기록 양식은 [REMOVE_REVIEW_ATTACHMENTS.md](./REMOVE_REVIEW_ATTACHMENTS.md)를 따른다.

## Stage B — 파괴적 정리

Stage B PR은 다음 조건을 모두 충족해야 병합한다.

- Stage A 앱/DB가 운영 중이다.
- purge 실행 기록과 승인자가 있다.
- purge 실행 결과가 `verifiedBucketAbsent=true`, `bucketExistsAfter=false`이고, 재실행한 dry-run이 `bucketExists=false`, `objectCount=0`이다.
- 새로운 DB 백업이 있다.

Stage B `DB Migrate` 사전검사는 대상 객체나 Storage API로 지워야 할 bucket 행이 남아 있으면 `SQA_REVIEW_ATTACHMENTS_BUCKET_STILL_EXISTS`로 push 전에 중단한다. 마이그레이션 `20260718073243_finalize_review_workflow_hardening.sql` 자체도 객체가 있으면 `SQA_REVIEW_ATTACHMENTS_NOT_EMPTY`, bucket이 남아 있으면 `SQA_REVIEW_ATTACHMENTS_BUCKET_PRESENT`로 정리 전에 실패한다. 정책 제거 중 객체나 bucket이 다시 생기면 `SQA_REVIEW_ATTACHMENTS_RACE_DETECTED` 또는 `SQA_REVIEW_ATTACHMENTS_BUCKET_RECREATED`로 전체 트랜잭션을 되돌린다. 통과하면 Storage 정책, `review_requests.attachment_url`, legacy `mark_password_changed()` 및 구형 review RPC overload를 제거하고 리뷰 직접 쓰기 권한을 회수한다. `auto_expose_new_tables=false`, schema ACL reset, 현재 routine ACL과 향후 객체의 전역 default ACL manifest도 같은 단계에서 적용한다.

## Stage B 후속 정정 — 20260718123250

운영에 기록된 `20260718073243`은 수정하지 않는다. 후속 마이그레이션 `20260718123250_remove_obsolete_review_status_rpc.sql`은 Stage B 이름 목록에서 빠진 구형 `public.update_review_request_status(uuid, public.review_status)`만 `DROP FUNCTION ... RESTRICT`로 제거한다. 다른 리뷰 RPC, 테이블, 정책, RLS, Storage 메타데이터, extension 객체 또는 ACL은 변경하지 않는다.

`citext`는 이번 정정에서 다른 schema로 이동하지 않는다. 현재 운영 컬럼과 인덱스가 해당 extension type을 사용하므로 relocation은 별도 호환성 작업이다. 대신 `review_hardening_gate`는 `pg_depend.deptype = 'e'`로 확인되는 실제 extension member routine만 전역 `anon` 검사에서 제외하고, `public`의 모든 비-extension routine에는 `has_function_privilege('anon', ..., 'EXECUTE') = false` 규칙을 유지한다. 소유자 이름, 특정 함수명, 현재 47개라는 개수는 예외 조건으로 사용하지 않는다.

후속 정정은 기존 branch, SHA, 24시간, 암호화 artifact 검사를 그대로 거친다. 적용 뒤 `scripts/verify-review-hardening-followup.sql`의 성공 기준은 다음과 같다.

- `stage_b_recorded=true`, `follow_up_recorded=true`
- `obsolete_rpc_absent=true`
- `application_anon_routine_count=0`
- `review_hardening_followup_gate=true`
- `extension_anon_routine_count`는 진단값이며 extension member라는 이유만으로 실패하지 않는다.

병합 뒤에는 동일한 `main` SHA로 CI green → 새 `Backup DB` → CI/backup run ID를 사용한 `DB Migrate` → `Deploy Worker(deploy_confirm=true, ci_run_id=<동일 SHA CI>, db_migrate_run_id=<방금 성공한 run>)` 순서로 실행하고, 각 workflow의 readiness/healthcheck가 끝날 때까지 기다린다.

## 롤백과 복구

- Stage A 앱 롤백: 직전 Worker 배포 버전을 재배포한다. Stage A DB 열/테이블은 additive이므로 그대로 둔다.
- Stage A DB 문제: 쓰기 트래픽을 멈추고 백업에서 별도 DB로 복원해 비교한다. 적용된 마이그레이션 파일을 수정하거나 역방향 SQL을 즉석 실행하지 않는다.
- purge 이전: Stage B를 중단하면 된다.
- purge 이후: Storage 파일 복구는 자동 롤백이 불가능하다. 승인된 외부 원본 또는 별도 Storage 백업에서만 복구한다.
- Stage B 이후 앱 롤백: attachment 계약을 참조하지 않는 Stage A 앱으로만 롤백할 수 있다. 그보다 오래된 앱은 다시 배포하지 않는다.

## 정기 운영

- 비밀번호 변경 재강제 dry-run: `node scripts/force-password-change.mjs --user-id=<uuid>` 또는 `--all-active`
- 승인 후 실행: 위 명령에 `--execute --confirm=FORCE_PASSWORD_CHANGE` 추가
- 활동 로그 180일 후보 확인: `npm run ops:activity-prune:dry-run`
- 승인 후 실행: `node scripts/prune-activity-logs.mjs --retention-days=180 --execute --confirm=PRUNE_ACTIVITY_LOGS`

활동 로그 정리는 `public.activity_logs`만 대상으로 하며 `private.audit_events`는 삭제하지 않는다.
