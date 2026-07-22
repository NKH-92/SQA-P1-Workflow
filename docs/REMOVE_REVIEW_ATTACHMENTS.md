# 리뷰 첨부 제거 배포 런북

리뷰 첨부 제거는 되돌릴 수 없는 운영 파일 삭제를 포함한다. Stage A 배포와 Stage B 배포를 분리하고, 운영자가 Storage 0건 증거를 남기기 전에는 Stage B PR을 병합하지 않는다. Codex와 CI는 운영 파일 purge를 실행하지 않는다.

## 1. Stage A 운영 상태 확인

- Stage A가 `main`에 배포됐고 해당 SHA의 `Backup DB` → `DB Migrate` → `Deploy Worker`가 모두 성공했는지 확인한다.
- 검토요청 작성·수정·상세 화면에 파일 선택, 파일명, 업로드/다운로드 링크가 없는지 확인한다.
- 새 요청을 만든 뒤 Storage 객체 수가 늘지 않는지 확인한다.
- 변경 기록에 Stage A SHA, 세 workflow run ID, Worker healthcheck 결과를 남긴다.

## 2. 운영자 dry-run

서비스 역할 키는 승인된 운영자 셸의 일시 환경 변수로만 주입한다. 키 값은 문서, 이슈, PR, 로그에 적지 않는다.

```powershell
$env:SUPABASE_URL = '<production project URL>'
$env:SUPABASE_SERVICE_ROLE_KEY = '<ephemeral service-role key>'
node scripts/purge-review-attachments.mjs --output=ops-output/review-attachments-dry-run.json
```

저장된 보고서에서 기록할 값은 `target.projectRef`, `bucket`, `bucketExists`, `inventory.objectCount`, `inventory.totalBytes`, `inventory.nameDigestSha256`이다. 기본 출력에는 파일명이 없으며, 파일명 확인이 별도로 승인된 경우에만 `--verbose`를 사용한다. `ops-output/`은 git에 포함하지 않는다.

## 3. 보존·삭제 승인

다음을 한 변경 기록에 남긴다.

- dry-run 시각과 결과 digest
- 삭제 대상이 `review-attachments` 하나인지
- 보존 정책 판단과 외부 원본/별도 백업 필요 여부
- 승인자와 실행자
- purge가 되돌릴 수 없고 DB 백업에 Storage 객체가 포함되지 않는다는 확인

## 4. 운영자 purge 실행과 0건 재확인

승인된 운영자만 다음 명령을 실행한다.

```powershell
node scripts/purge-review-attachments.mjs --execute --confirm=PURGE_REVIEW_ATTACHMENTS --output=ops-output/review-attachments-execute.json
node scripts/purge-review-attachments.mjs --output=ops-output/review-attachments-zero-recheck.json
```

다음 조건을 모두 만족해야 한다.

- execute 보고서 `execution.failedObjectCount=0`
- execute 보고서 `execution.verifiedRemainingObjectCount=0`
- execute 보고서 `execution.verifiedBucketAbsent=true`
- execute 보고서 `execution.bucketExistsAfter=false`
- 별도 dry-run 보고서 `bucketExists=false`, `inventory.objectCount=0`
- 두 결과의 대상 URL/project ref와 bucket이 동일

execute 보고서가 `execution.bucketAlreadyAbsent=true`이거나 `execution.bucketDeleteAttempted=false`라면 성공으로 자동 승인하지 않는다. 누가 어떤 승인으로 먼저 삭제했는지 변경 기록과 Storage 로그를 대조해 별도 승인한다. 하나라도 다르면 Stage B를 중단한다. 스크립트는 실패한 batch가 있거나 빈 bucket의 Storage API 삭제·부재 재확인이 실패하면 exit code 1로 종료한다. SQL로 `storage.objects` 또는 `storage.buckets` 행을 삭제해서 우회하지 않는다. 결과를 기록한 뒤 키를 셸에서 제거한다.

```powershell
Remove-Item Env:SUPABASE_SERVICE_ROLE_KEY
Remove-Item Env:SUPABASE_URL
```

## 5. Stage B 병합과 배포

0건·bucket 부재 증거와 승인자를 Stage B PR에 연결한 뒤에만 병합한다. 병합 전 `supabase_migrations.schema_migrations`에서 버전 `20260718073243`이 기록되지 않았는지 읽기 전용으로 확인한다. 영구 환경에 이미 기록됐다면 적용된 migration 파일을 덮어쓰지 말고 실제 스키마 상태를 대조한 뒤 별도 roll-forward migration을 검토한다.

`DB Migrate` 사전검사는 객체나 빈 bucket 행이 남아 있으면 `SQA_REVIEW_ATTACHMENTS_BUCKET_STILL_EXISTS`로 push 전에 실패한다. Stage B 파일 `20260718073243_finalize_review_workflow_hardening.sql`도 객체가 남아 있으면 `SQA_REVIEW_ATTACHMENTS_NOT_EMPTY`, bucket이 남아 있으면 `SQA_REVIEW_ATTACHMENTS_BUCKET_PRESENT`로 어떤 정리보다 먼저 실패한다. Storage 정책 제거 중 객체나 bucket이 다시 생기면 두 번째 검사에서 `SQA_REVIEW_ATTACHMENTS_RACE_DETECTED` 또는 `SQA_REVIEW_ATTACHMENTS_BUCKET_RECREATED`로 전체 트랜잭션을 되돌린다.

병합 후 동일한 `main` SHA에서 다음 순서를 지킨다.

1. `Backup DB` 성공 및 암호화 artifact 확인
2. backup run ID를 입력한 `DB Migrate` 성공
3. DB readiness에서 bucket·Storage policy·`attachment_url`·retired/legacy review RPC 부재, 리뷰 direct write 차단, schema/default ACL 확인
4. `Deploy Worker`, `deploy_confirm=true`, 동일 SHA의 성공한 `ci_run_id`와 `db_migrate_run_id`로 실행
5. root mount, CSP, `nosniff` healthcheck 완료

## 6. 최종 검증과 기록 형식

다음 템플릿을 변경 기록에 채운다.

```text
Stage A SHA / deploy run:
purge 승인자 / 실행자:
dry-run bucketExists / inventory.objectCount / inventory.totalBytes / digest:
execute execution.failedObjectCount / execution.verifiedRemainingObjectCount / execution.bucketDeleted / execution.bucketAlreadyAbsent / execution.verifiedBucketAbsent / execution.bucketExistsAfter:
zero recheck bucketExists / inventory.objectCount:
Stage B migration-history check:
Stage B SHA:
Backup DB / DB Migrate / Deploy Worker run IDs:
DB readiness: bucket=absent, policies=0, attachment_url=absent, legacy RPC/overloads=absent, direct review writes=denied, schema CREATE=denied, future PUBLIC EXECUTE=denied
Smoke: leader login, member login, password-change gate, review create/edit/approve/reject/withdraw, feedback update/void, unread sync
Worker health: HTTP status, root mount, CSP, nosniff
최종 승인자 / 시각:
```

Stage B 이후에는 첨부 기능을 참조하는 이전 Worker 버전을 재배포하지 않는다. Storage 파일은 DB rollback으로 복구되지 않는다.
