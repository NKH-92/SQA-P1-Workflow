# 검토 워크플로 하드닝 운영 런북

이 릴리스는 되돌릴 수 있는 Stage A와, 운영 Storage가 비었음을 사람이 확인한 뒤에만 적용하는 Stage B로 분리한다. 기존 마이그레이션 파일은 수정하지 않는다.

## Stage A — 비파괴 전환

1. `Backup DB`를 `main`에서 실행하고 암호화 백업 artifact와 run ID를 확인한다.
2. `DB Migrate`에 해당 backup run ID를 전달한다.
3. 다음 readiness 쿼리를 확인한다.
   - `review_events`, `review_read_receipts`가 존재하고 RLS가 켜져 있다.
   - `mark_password_changed()`는 플래그를 변경하지 않고 Auth 트리거가 관찰한 결과만 반환한다.
   - 리뷰 생성·수정·승인·반려·재요청·회수·피드백 수정·무효화 RPC가 `authenticated`에만 열려 있다.
4. `Deploy Worker`를 `main`, `deploy_confirm=true`로 실행하고 root mount 및 보안 헤더 healthcheck 완료까지 기다린다.
5. 브라우저에서 신규 검토 작성 화면에 파일 선택/링크가 없고 별도 메신저 안내만 보이는지 확인한다.

Stage A 동안 기존 `attachment_url`, Storage bucket, Storage 정책은 호환 목적으로 유지되지만 앱은 새 첨부를 만들거나 읽지 않는다.

## 운영자 Storage purge 장벽

서비스 역할 키는 로컬 셸의 환경 변수로만 주입하며 저장하거나 로그에 출력하지 않는다.

```powershell
$env:SUPABASE_URL = '<production project URL>'
$env:SUPABASE_SERVICE_ROLE_KEY = '<ephemeral service-role key>'
npm run ops:attachments:dry-run
```

dry-run 결과의 `bucket`, `objectCount`, `nameDigestSha256`를 변경 기록에 남긴다. 파일명 자체는 출력하지 않는다. 보존 정책과 승인자를 확인한 운영자만 다음을 실행한다.

```powershell
node scripts/purge-review-attachments.mjs --execute --confirm=PURGE_REVIEW_ATTACHMENTS
```

성공 기준은 마지막 JSON의 `verifiedRemainingObjectCount`가 `0`인 것이다. 키를 셸에서 제거한 뒤 Stage B를 진행한다. Codex 자동화는 이 실행 단계를 수행하지 않는다.

## Stage B — 파괴적 정리

Stage B PR은 다음 조건을 모두 충족해야 병합한다.

- Stage A 앱/DB가 운영 중이다.
- purge 실행 기록과 승인자가 있다.
- purge 후 재실행한 dry-run의 `objectCount`가 `0`이다.
- 새로운 DB 백업이 있다.

Stage B 마이그레이션 자체도 `storage.objects`에 대상 bucket 객체가 하나라도 있으면 예외로 중단한다. 통과하면 Storage 정책과 bucket 메타데이터, `review_requests.attachment_url`, legacy `mark_password_changed()`를 제거하고 리뷰 직접 쓰기 권한을 회수한다.

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
