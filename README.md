# SQA P1 Workflow

파트의 업무 배정, 검토 요청, 변경 적용, 프로젝트와 공지를 한곳에서 관리하는
내부 업무용 웹 애플리케이션입니다. 파트장, 읽기 전용 팀장, 파트원의 화면·권한을 분리하고,
Supabase Row Level Security(RLS)와 감사 이벤트로 서버 측 권한을 강제합니다.

> **저장소 등급: Private / 내부 운영용**
> Git 이력에 과거 팀원 개인정보와 운영 식별자가 포함되어 있으므로 공개 전환,
> 공개 fork, 외부 미러링을 금지합니다. 상세 정책은 [SECURITY.md](SECURITY.md)를
> 따릅니다.

## 현재 운영 기준

| 항목 | 기준 |
|---|---|
| 기본 브랜치 | `main` |
| 운영 기준점 | [`prod-2026-07-23`](https://github.com/NKH-92/SQA-P1-Workflow/releases/tag/prod-2026-07-23) |
| 병합 정책 | 운영상 PR 필수, 저장소는 squash merge만 허용, 병합 후 브랜치 자동 삭제 |
| `main` 보호 | 현재 GitHub 요금제의 Private ruleset 미지원; 직접 push·force push를 운영상 금지 |
| 배포 방식 | GitHub Actions 수동 승격: Backup DB → DB Migrate → Deploy Worker |
| 프런트엔드 | React 18, TypeScript, Vite |
| 인증·DB | Supabase Auth, PostgreSQL, RLS |
| 호스팅 | Cloudflare Workers static assets |

운영 URL, Supabase project ref, 계정 ID와 실제 사용자 정보는 저장소에 기록하지
않습니다. GitHub Variables/Secrets 또는 승인된 내부 운영 기록에서만 관리합니다.

## 주요 기능

| 영역 | 파트장 | 파트원 |
|---|:---:|:---:|
| 홈·업무 현황 | 전체 현황, 우선처리 큐, 월간 검토 처리 | 본인 업무, 기한, 알림 |
| 공지 | 조회·등록·수정·고정·삭제 | 조회 |
| 검토 요청 | 전체 요청 검토, 피드백, 완료·반려·재오픈 | 본인 요청 등록·수정·회수·재검토 |
| 검토 통계 | 기간·요청자·상태별 집계 | - |
| 변경 적용 | 변경건·제품·담당자별 관리 | 본인 적용업무 확인·완료 |
| 프로젝트 | 생성·수정·배정·삭제 | 본인 배정 프로젝트 조회 |
| 파트원·마스터 | 파트원, 제품, 업무 카테고리, 계정 관리 | 본인 담당제품·업무 조회 |
| 활동 로그 | 최근 업무 이력과 감사 이력 조회 | - |

### 검토 요청 흐름

```text
파트원 요청(pending)
  ├─ 파트장 피드백 → pending 유지
  ├─ 파트장 완료 → approved
  └─ 파트장 반려 → rejected
       └─ 파트원 수정·피드백 후 재검토 → 같은 요청 ID로 pending
```

- 제목·설명·기한의 입력 계약은 UI, local adapter, Supabase 쓰기 경로에서 동일하게
  검증합니다.
- 검토 자료는 파일로 첨부하지 않습니다. 승인된 사내 메신저로 전달하고 요청
  본문에는 자료명과 확인 요청만 기록합니다.
- 해시 딥링크(`#/reviews?id=<uuid>`)를 사용해 같은 검토요청으로 이동할 수 있습니다.

## 시스템 구조

```text
React 화면
  → feature controller / selector
    → data public API / RepositorySet
      → local preview adapter | Supabase adapter
        → Supabase Auth + PostgreSQL RLS

Vite production build
  → security headers + provenance + bundle budget
    → Cloudflare Workers static assets
```

핵심 경계:

- `src/domain`: React·DB에 의존하지 않는 상태 전이와 권한 규칙
- `src/data`: 조회 계약, repository, local/remote adapter, mutation 조정
- `src/features`: 화면별 controller, selector, validator, 표현 컴포넌트
- `src/screens`: feature 조립과 화면 상태
- `src/app`: 인증, 동기화, 탐색, 알림, mutation runner
- `src/lib`: 날짜, 표시, CSV, 오류 등 저수준 유틸리티
- `supabase/migrations`: append-only DB·RLS 변경 이력

상세한 import 경계와 데이터 snapshot 계약은
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)를 참고합니다.

## 로컬 실행

### 사전 조건

- Node.js 22
- npm
- DB/RLS 전체 검증 시 Docker와 Supabase CLI `2.109.1`
- 브라우저 E2E 실행 시 Playwright Chromium

### Preview 모드

Supabase 없이 데모 데이터로 UI를 확인할 수 있습니다.

```bash
npm ci
cp .env.example .env.local
```

`.env.local`:

```dotenv
VITE_APP_MODE=preview
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

```bash
npm run dev
```

### Supabase 연결 모드

```dotenv
VITE_APP_MODE=development
VITE_SUPABASE_URL=<SUPABASE_URL>
VITE_SUPABASE_ANON_KEY=<SUPABASE_PUBLISHABLE_KEY>
```

`VITE_*` 값은 브라우저 번들에 포함됩니다. `service_role` key, DB 비밀번호,
Cloudflare token, 백업 암구호를 `VITE_*` 변수나 로컬 파일에 넣지 마세요.

### 앱 모드

| 모드 | 데이터 소스 | 환경 변수 누락 시 |
|---|---|---|
| `preview` | 내장 데모 데이터 | Supabase 없이 실행 |
| `development` | Supabase | 설정 오류 화면 |
| `production` | Supabase | 로그인 우회 없이 설정 오류 화면 |

앱에는 공개 가입 화면이 없습니다. 운영 계정은 파트장이 앱의 계정 관리 화면에서
생성합니다. 임시 비밀번호 `12345678`은 최초 로그인 직후 다른 8자 이상 비밀번호로
변경해야 하며, 완료 전에는 RLS가 업무 데이터 접근을 차단합니다. 팀장은 파트장
워크스페이스 전체를 조회하지만 업무·계정 데이터는 수정할 수 없습니다.

## 명령어

| 명령 | 용도 |
|---|---|
| `npm run dev` | Vite 개발 서버 |
| `npm run build` | 타입 검사, production build, 보안 헤더·provenance·번들 예산 |
| `npm run preview` | production build 로컬 미리보기 |
| `npm run typecheck` | TypeScript 검사 |
| `npm run lint` | ESLint, 계층 경계, CSS 변수, migration 문서 drift |
| `npm test -- --run` | Vitest 단위·통합 테스트 |
| `npm run test:e2e` | Preview Playwright 17개 시나리오 |
| `npm run test:rls:full` | local Supabase 전체 RLS gate |
| `npm run test:e2e:remote` | local Supabase 기반 remote workflow E2E 15개 시나리오 |
| `npm run check:bundle` | 초기·전체·개별 chunk 번들 예산 |
| `npm run docs:migrations:check` | migration 문서와 파일 목록 일치 확인 |

일반 변경의 최소 로컬 검증:

```bash
npm run typecheck
npm run lint
npm test -- --run
npm run build
npm run test:e2e
git diff --check
```

DB, RLS, repository 또는 배포 계약을 바꾸면 `npm run test:rls:full`과
`npm run test:e2e:remote`까지 필수입니다. Docker가 없어 RLS가 skip된 결과는
완료 증거가 아닙니다.

## 배포 흐름

```text
작업 브랜치
  → PR
    → CI(typecheck · lint · unit · RLS · preview E2E · remote E2E · build)
      → squash merge
        → Backup DB(암호화 artifact, 90일)
          → DB Migrate(동일 SHA + 최근 backup 증거)
            → Deploy Worker(동일 SHA + CI/DB 증거)
              → live provenance · CSP · healthcheck
```

- `main` 직접 push와 force push는 금지합니다. 현재 GitHub 요금제는 Private
  ruleset을 지원하지 않아 서버 강제 대신 운영 절차로 통제하며, GitHub Pro 이상으로
  전환하면 PR·필수 check·linear history ruleset을 다시 활성화합니다.
- 운영 배포는 자동 실행하지 않습니다. 승인된 운영자가
  `workflow_dispatch` 입력과 동일 SHA 증거를 확인한 뒤 단계별로 실행합니다.
- DB 변경이 없는 릴리스도 `DB Migrate`를 실행해 migration history와 canonical
  readiness를 같은 SHA에서 확인합니다.
- 기존 migration은 수정·삭제·이름 변경하지 않고 새 파일로만 보정합니다.
- 반복 배포는 [docs/RELEASE_CHECKLIST.md](docs/RELEASE_CHECKLIST.md)를 따릅니다.

## 보안·데이터 원칙

- 인증 여부와 역할은 화면 숨김이 아니라 Supabase RLS·RPC에서 다시 검증합니다.
- 공개 signup은 비활성화하고 승인된 이메일만 계정으로 생성합니다.
- `service_role`, DB URL, Cloudflare token, 백업 암구호는 브라우저와 저장소에
  포함하지 않습니다.
- 운영 DB 백업은 GPG AES-256으로 암호화·복호화 검증한 파일만 GitHub Actions
  Artifact에 90일간 보관합니다. 평문 dump는 업로드 전에 제거합니다.
- audit migration과 기존 migration은 append-only입니다.
- 동기화가 부분 실패하면 직전 정상 snapshot을 유지하면서 사용자에게 경고합니다.
- 보안 사고나 노출 의심이 있으면 [SECURITY.md](SECURITY.md)의 대응 절차를
  우선합니다.

## 문서 안내

### 현재 운영 문서

| 문서 | 내용 |
|---|---|
| [SECURITY.md](SECURITY.md) | 저장소 등급, 비밀정보·개인정보, 사고 대응 |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | 계층·데이터 snapshot·권한 계약 |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | GitHub, Supabase, Workers 설정과 배포 |
| [docs/RELEASE_CHECKLIST.md](docs/RELEASE_CHECKLIST.md) | 반복 배포 승인·증거 체크리스트 |
| [docs/OPERATIONS.md](docs/OPERATIONS.md) | 백업·복구·장애·계정 관리 런북 |
| [docs/DR_CONTRACT.md](docs/DR_CONTRACT.md) | 백업 등급과 재해복구 증거 계약 |
| [docs/SUPABASE_MIGRATIONS.md](docs/SUPABASE_MIGRATIONS.md) | migration 목록·readiness |
| [docs/TEST_PLAN.md](docs/TEST_PLAN.md) | 기능·RLS·E2E 검증 시나리오 |
| [docs/ROADMAP.md](docs/ROADMAP.md) | 미완료 유지보수 백로그 |
| [DESIGN.md](DESIGN.md) | 디자인 토큰·UI 계약 |

완료된 일회성 전환 계획과 초기 구축 체크리스트는
[docs/archive/README.md](docs/archive/README.md)에 보관합니다. 보관 문서는 현재
반복 운영 절차보다 우선하지 않습니다.
