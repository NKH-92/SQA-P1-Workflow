# 보안 정책

## 저장소 분류

이 저장소는 **Private / 내부 운영용**입니다. 현재 소스의 실값은 제거되어 있지만
Git 과거 이력에는 팀원 실명·사내 이메일·운영 프로필 식별자·운영 URL이 포함되어
있습니다.

다음 행위를 금지합니다.

- 저장소를 Public으로 전환
- 공개 fork, 공개 template 또는 외부 미러 생성
- Git bundle, archive, patch, Actions artifact를 승인되지 않은 외부 채널로 전달
- 운영 DB dump, 사용자 목록, 로그 원문을 issue·PR·commit에 첨부

외부 공개가 필요하면 이 저장소를 전환하지 않고, 개인정보와 운영 식별자를 전수
정제한 **별도 신규 저장소**를 검토합니다.

## 지원 범위

| 대상 | 보안 수정 |
|---|---|
| `main` | 지원 |
| 최신 운영 태그 | 운영 rollback 기준으로 지원 |
| 병합되지 않은 작업 브랜치 | PR 단위 검토 |
| 과거 태그·과거 배포 | 별도 지원하지 않음 |

## 비밀정보와 운영 식별자

| 분류 | 예 | 저장소 커밋 | 관리 위치 |
|---|---|:---:|---|
| 고위험 비밀정보 | `service_role` key, DB 비밀번호·URL, Cloudflare API token, 백업 암구호 | 금지 | GitHub Secrets, 승인된 비밀번호 관리자 |
| 사용자 개인정보 | 이름, 사내 이메일, Auth/Profile UUID, 메모·업무 원문 | 금지 | 운영 DB, 승인된 내부 기록 |
| 운영 식별자 | Worker URL, Supabase project ref, Cloudflare account ID | 금지 | GitHub Variables 또는 내부 운영 기록 |
| 브라우저 공개 설정 | Supabase URL, publishable/anon key | 소스 하드코딩 금지 | GitHub Variable/Secret, 로컬 `.env.local` |
| 예제 값 | `example.com`, 명백한 fixture UUID·token | 허용 | 테스트·예제 파일 |

`VITE_*` 환경 변수는 빌드 시 브라우저에 공개됩니다. 여기에 `service_role` key,
DB credential, Cloudflare token 또는 백업 암구호를 넣지 않습니다.

## 개인정보 처리

- 운영 Supabase 프로젝트는 서울 리전(`ap-northeast-2`)을 사용합니다.
- 공개 signup을 비활성화하고 파트장이 승인한 계정만 생성합니다.
- 퇴사·전배자는 기본적으로 삭제가 아니라 비활성화해 감사·업무 이력을 보존합니다.
- 화면 알림과 로그에는 업무에 필요한 최소 정보만 표시합니다.
- 개인정보가 포함될 수 있는 DB backup은 암호화된 파일만 보관합니다.

세부 계정·백업 절차는 [docs/OPERATIONS.md](docs/OPERATIONS.md)를 따릅니다.

## 백업 Artifact

운영 DB의 L2 backup은 다음 통제를 모두 충족해야 합니다.

1. `main`의 **Backup DB** workflow에서만 생성
2. GPG AES-256 암호화 후 같은 job에서 복호화·manifest 재검증
3. 평문 dump와 임시 복호화 폴더 제거 확인
4. 암호화된 GitHub Actions Artifact만 업로드
5. 보존 기간 90일
6. `BACKUP_PASSPHRASE`는 GitHub Secret과 별도 비밀번호 관리자에서 관리

Artifact가 암호화되어 있어도 다운로드 권한을 최소화합니다. 암구호 유출이 의심되면
기존 backup을 신뢰하지 않고 암구호를 교체한 뒤 새 backup과 복원 리허설을 수행합니다.

## 변경·배포 통제

- 저장소 설정은 squash merge만 허용하고 병합된 작업 브랜치를 자동 삭제합니다.
- 현재 GitHub 요금제는 Private 저장소 ruleset을 지원하지 않습니다. `main` 직접
  push·force push·삭제를 운영상 금지하고 PR의 전체 `build` 성공을 사람이
  확인합니다. GitHub Pro 이상으로 전환하면 PR·필수 check·linear history
  ruleset을 다시 활성화합니다.
- 기존 Supabase migration은 append-only이며 수정·삭제·rename하지 않습니다.
- 운영 승격은 동일 SHA의 `CI → Backup DB → DB Migrate → Deploy Worker` 증거를
  사용합니다.
- DB와 RLS 변경은 local full RLS gate와 remote E2E를 통과해야 합니다.
- workflow와 third-party action은 최소 권한을 사용하고 action commit SHA를 고정합니다.

반복 배포의 서명·증거 항목은
[docs/RELEASE_CHECKLIST.md](docs/RELEASE_CHECKLIST.md)를 사용합니다.

## 취약점·노출 의심 보고

보안 이슈를 공개 issue에 작성하지 않습니다. 저장소 관리자에게 승인된 내부
1:1 채널로 다음 정보만 전달합니다.

- 발견 시각과 발견 경로
- 영향을 받는 환경·브랜치·SHA
- 노출되었을 가능성이 있는 정보의 **종류**(실값 자체는 보내지 않음)
- 재현에 필요한 최소 단계
- 이미 수행한 격리 조치

## 사고 대응

1. **격리**: 배포·DB migration을 중단하고 저장소·Artifact·계정 접근 범위를 확인
2. **분류**: 비밀정보, 개인정보, 운영 식별자, 코드 결함 중 무엇인지 구분
3. **회전·차단**: 노출된 credential 폐기·재발급, 관련 세션과 token 무효화
4. **정정**: 새 PR 또는 append-only migration으로 roll-forward
5. **검증**: CI, RLS, E2E, backup/restore, 운영 healthcheck 재실행
6. **기록**: 영향 범위, 조치 시각, 승인자, 후속 예방책을 비공개 운영 기록에 남김

Git 이력에서 개인정보나 credential이 발견된 경우 단순 삭제 커밋만으로 제거됐다고
판단하지 않습니다. 저장소를 Private으로 유지한 채 노출 범위와 fork·PR ref·cache를
확인하고, 필요하면 별도 승인 아래 이력 재작성과 GitHub 지원 요청을 수행합니다.
