# Release Readiness

## Stage A

- [x] `npm ci`
- [x] `npm run typecheck`
- [x] `npm run lint`
- [x] `npm test`
- [x] `npm run build`
- [x] 로컬 Supabase 가능 시 reset + RLS 테스트; 불가능하면 CI RLS gate 확인
- [x] 새 마이그레이션은 새 파일이며 기존 파일 checksum 불변
- [x] 리뷰 요청/피드백 중요 변경은 OCC RPC 사용
- [x] `localStorage` 기반 리뷰 읽음 상태 없음
- [x] 1,001행 pagination 회귀 테스트 통과
- [x] 선택적 slice 실패 시 마지막 정상 데이터 유지
- [x] 비밀번호 변경 완료는 `auth.users.encrypted_password` 트리거 관찰 결과
- [x] 프로필 물리 삭제 차단, 비활성화 경로 유지
- [x] 변경 적용 범위 제외와 수동 취소가 구분됨
- [x] 자동 보관은 사람 actor를 주장하지 않음
- [x] 감사 원본은 변경 필드 delta/사유/출처만 저장
- [x] Backup DB → DB Migrate → Deploy Worker → healthcheck 순서 완료

## Storage purge barrier

- [x] Stage A 운영 배포 완료
- [ ] 운영자 dry-run 결과 기록
- [ ] 보존 정책/승인자 확인
- [ ] 운영자가 명시적 confirm으로 purge 실행
- [ ] `verifiedRemainingObjectCount=0`
- [ ] execute `verifiedBucketAbsent=true`
- [ ] execute `bucketExistsAfter=false`
- [ ] `bucketAlreadyAbsent=true` 또는 `bucketDeleteAttempted=false`라면 별도 변경 기록 대조·승인
- [ ] 재 dry-run `bucketExists=false`, `objectCount=0`

## Stage B

- [ ] purge 증거가 PR/변경 기록에 연결됨
- [ ] 신규 DB 백업 완료
- [x] 마이그레이션 zero-object guard 포함
- [x] attachment column/bucket/policy/legacy RPC 제거 코드 준비
- [x] 직접 리뷰 mutation grant 및 자동 노출 기본값 회수 코드 준비
- [ ] Stage B CI 전체 통과
- [ ] DB Migrate 및 Worker 재배포 healthcheck 완료
