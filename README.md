# 파트 업무관리 시스템

React + Vite + Supabase 기반의 파트 업무관리 MVP입니다.

## 포함 범위

- 파트장: 초대 사용자, 제품/업무 마스터, 담당제품/담당업무 배정, 검토요청 상태/피드백, 프로젝트 배정 관리
- 파트원: 본인 담당제품/담당업무, 본인 검토요청, 본인 프로젝트 배정 확인
- Supabase Auth 이메일/비밀번호 로그인
- 초대 이메일 기반 `profiles` 생성
- Supabase RLS 기반 leader/member 권한 분리
- Cloudflare Pages 정적 SPA 배포 구조

## 시작하기

```bash
npm install
cp .env.example .env.local
npm run dev
```

환경변수가 없으면 빈 미리보기 모드로 실행됩니다. 실제 데이터 연동은 `.env.local`에 Supabase URL과 anon key를 넣은 뒤 사용합니다.

## Supabase 설정

마이그레이션은 `supabase/migrations` 아래 SQL 파일을 번호 순서대로 적용합니다.
첫 파트장 등록과 Cloudflare Pages 배포 절차는 `docs/DEPLOYMENT.md`를 확인하세요.

## 검증

```bash
npm test
npm run build
```

RLS 수동 검증 시나리오는 `docs/TEST_PLAN.md`에 정리되어 있습니다.
