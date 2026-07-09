# SQA P1 Workflow

팀 업무 배정, 검토 요청, 프로젝트 현황을 관리하는 SPA입니다.

## 환경 변수

`.env.example`을 `.env.local`로 복사한 뒤 값을 채웁니다.

| 변수 | 설명 |
|---|---|
| `VITE_APP_MODE` | `development`, `preview`, `production` 중 하나 |
| `VITE_SUPABASE_URL` | Supabase 프로젝트 URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon key |

### 모드별 동작

- **production** — Supabase env가 필수입니다. 누락 시 로그인 우회 없이 설정 오류 화면만 표시됩니다.
- **development** — 로컬 개발용입니다. Supabase env 없으면 설정 오류 화면이 표시됩니다.
- **preview** — Supabase env 없이 데모 데이터로 UI를 미리볼 수 있습니다. `VITE_APP_MODE=preview`와 빈 Supabase env를 사용하세요.

### 로컬 실행

```bash
npm ci
cp .env.example .env.local
# 운영/개발: Supabase URL·key 입력
# 데모 미리보기: VITE_APP_MODE=preview, Supabase 값은 비워 둠
npm run dev
```

### 로그인

계정은 파트장이 Supabase Dashboard에서 생성합니다. 앱에서는 로그인만 가능합니다.

- 파트장이 등록한 이메일만 사용할 수 있습니다.
- 최초 비밀번호는 `1234`이며, **최초 로그인 시 반드시 비밀번호를 변경**해야 합니다. 변경 전에는 서버(RLS)에서 데이터 접근이 차단되므로, 비밀번호를 바꾸기 전까지는 앱을 사용할 수 없습니다.

## 스크립트

```bash
npm run dev        # 개발 서버
npm run build      # production 빌드
npm test           # 단위 테스트
npm run typecheck  # TypeScript 검사
npm run lint       # ESLint
```

## 문서

| 문서 | 내용 |
|---|---|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | 소스 구조·계층 규칙·권한 모델·테스트 지도 |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | GitHub·Workers·Supabase 배포 설정 |
| [docs/MANUAL_TASKS_PLAN.md](docs/MANUAL_TASKS_PLAN.md) | 운영 배포 체크리스트 (작업 0·A~G) |
| [docs/OPERATIONS.md](docs/OPERATIONS.md) | 백업·장애·계정 관리 런북 |
| [docs/SUPABASE_MIGRATIONS.md](docs/SUPABASE_MIGRATIONS.md) | 마이그레이션 정책·목록·확인 SQL |
| [docs/TEST_PLAN.md](docs/TEST_PLAN.md) | 기능·RLS 검증 시나리오 |
| [docs/ROADMAP.md](docs/ROADMAP.md) | 배포 이후 단계별 계획 |
| [DESIGN.md](DESIGN.md) | 디자인 토큰 계약 |
