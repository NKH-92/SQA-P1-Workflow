# 운영 런북

SQA P1 Workflow의 일상 운영·백업·장애 대응 절차입니다.

운영 URL·Supabase project ref는 팀 위키 또는 이 문서 하단에 `<WORKER_URL>`, `<PROJECT_REF>` 형태로만 기록하고, 저장소에는 커밋하지 않습니다.

## Cloudflare Access (필수)

내부 전용 배포에서는 Workers URL을 Cloudflare Access 뒤에 두어야 합니다. Access 없이 공개 URL을 두면 로그인 화면·anon key 노출 위험이 있습니다. 설정 절차는 [MANUAL_TASKS_PLAN.md](./MANUAL_TASKS_PLAN.md) 작업 H를 참고하세요.

## 장애 확인 순서

| 순서 | 확인 대상 | 방법 | 정상 기준 |
|---|---|---|---|
| 1 | 앱 접속 | Workers URL 브라우저 접속 | 로그인 화면 또는 홈 표시 |
| 2 | Cloudflare Workers | Dashboard > Workers & Pages > 해당 Worker | 최근 배포 성공, 에러율 없음 |
| 3 | Supabase | Dashboard > Logs (API, Auth) | 5xx 급증 없음 |
| 4 | Auth | Dashboard > Authentication > Users | 로그인 시도 실패 패턴 확인 |

## 주간 백업

| 항목 | 내용 |
|---|---|
| 담당 | 파트장 또는 지정 운영자 |
| 주기 | 주 1회 이상 (권장: 일요일) |
| 명령 | `powershell -File scripts/backup-db.ps1 -DatabaseUrl "<DATABASE_URL>"` (스키마·데이터 각각 덤프) |
| 보관 | 사내 접근 통제된 저장소(로컬 NAS, 암호화 드라이브). **공개 저장소·이메일 첨부 금지** |
| 확인 | `*-schema.sql`·`*-data.sql` 모두 크기 > 0, schema 파일에 `CREATE TABLE`, data 파일에 `COPY` 또는 `INSERT` 포함 |

`DATABASE_URL`은 Supabase Dashboard > Project Settings > Database > Connection string (URI)에서 확인합니다.

## 분기 복구 리허설

1. 테스트용 Supabase 프로젝트(또는 로컬 Postgres)를 준비합니다.
2. 최신 백업 SQL을 `psql` 또는 Supabase SQL Editor로 복원합니다.
3. `profiles`, `review_requests`, `products` 행 수를 운영과 대조합니다.
4. 리허설 날짜·담당·결과를 이 문서 하단 또는 팀 위키에 기록합니다.

## 사용자 제거 (접근 회수)

초대 목록(`allowed_users`)에서 삭제하는 것만으로는 **이미 가입한 계정의 로그인을 막을 수 없습니다.**

| 단계 | 작업 | 확인 |
|---|---|---|
| 1 | Supabase Dashboard > Authentication > Users | 대상 이메일 검색 |
| 2 | 사용자 삭제 | `profiles`는 FK cascade로 함께 삭제됨 |
| 3 | (선택) `allowed_users`에서도 제거 | 앱 > 마스터 > 초대 관리 |
| 4 | 대상 계정으로 로그인 시도 | 접근 불가 확인 |

## 임시 비밀번호·첫 로그인

1. 파트장이 `allowed_users`에 이메일·이름·역할을 등록합니다.
2. Supabase Dashboard > Authentication > Users > Add user 로 계정을 만들거나, 사용자가 앱에서 가입합니다.
3. 임시 비밀번호 발급 시 **최소 4자**(로그인 폼)이며, 첫 로그인 후 8자 이상으로 변경해야 합니다(`must_change_password`).
4. `'1234'` 등 너무 단순한 비밀번호는 앱에서 거부됩니다.

## 사용자 비활성화 (is_active)

| 단계 | 작업 | 확인 |
|---|---|---|
| 1 | 마스터 > 초대 관리에서 대상 사용자 `비활성화` | 상태 배지가 `비활성`으로 변경 |
| 2 | 대상 계정으로 로그인 | "계정이 비활성화되었습니다" 안내 |
| 3 | 재활성화 후 로그인 | 정상 홈 진입 |

상세 RLS·Storage 검증은 [MANUAL_TASKS_PLAN.md](./MANUAL_TASKS_PLAN.md) 작업 F를 참고한다.

## 배포

자세한 CI/CD 설정은 [DEPLOYMENT.md](./DEPLOYMENT.md)를 참고하세요.  
**직접 수행 작업 전체 계획**은 [MANUAL_TASKS_PLAN.md](./MANUAL_TASKS_PLAN.md)를 참고하세요.

Windows에서 `npm ci`가 `EPERM`으로 실패하면, 다른 터미널·에디터에서 `node_modules`를 잠그고 있지 않은지 확인한 뒤 해당 폴더를 삭제하고 다시 실행하세요.

## 복구 리허설 기록

| 날짜 | 담당 | 백업 파일 | 결과 |
|---|---|---|---|
| (미실시) | | | |
