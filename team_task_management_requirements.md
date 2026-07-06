# SQA P1 Workflow – 요구사항 문서

> 이 문서는 Codex 등 코딩 에이전트에게 컨텍스트로 전달해 프로젝트를 스캐폴딩하는 용도로 작성했습니다. 8번 "가정 사항"은 실제 요구사항과 다르면 수정한 뒤 전달해 주세요.

## 1. 개요

| 항목 | 내용 |
|---|---|
| 시스템명 | SQA P1 Workflow |
| 목적 | 파트장이 파트원의 담당업무·검토요청·프로젝트 배정을 관리하고, 파트원은 본인 업무를 확인하고 검토를 요청 |
| 사용자 규모 | 약 10명 (파트장 1명 + 파트원 다수) |
| 배포 방식 | 웹 브라우저 기반, 무료 호스팅 |

## 2. 사용자 역할

### 2.1 파트장 (Leader)
- 전체 파트원의 담당제품/담당업무를 조회
- 파트원들의 검토요청에 피드백 작성
- 프로젝트성(논루틴) 업무를 생성하고 파트원에게 배정

### 2.2 파트원 (Member)
- 본인의 담당제품/담당업무만 조회 (다른 파트원 정보는 비공개)
- 파트장에게 검토를 요청
- 본인에게 배정된 프로젝트/논루틴 업무 확인

## 3. 기능 요구사항

### 3.1 파트장 화면

**A. 팀 대시보드**
- 파트원 목록과 각자의 담당제품, 담당업무를 한눈에 보는 테이블/카드 뷰
- 파트원 클릭 시 상세 정보 확인

**B. 검토요청 관리**
- 전체 파트원의 검토요청 목록 (상태별 필터: 대기중/완료/반려)
- 요청 상세 확인 후 피드백(텍스트) 작성 및 상태 변경

**C. 프로젝트 배정 관리**
- 프로젝트(논루틴 업무) 생성 – 이름, 설명, 마감일
- 파트원 배정
- 전체 파트원의 프로젝트 배정 현황을 한눈에 보는 뷰 (프로젝트별 배정 인원, 인당 배정 프로젝트 수 등)

### 3.2 파트원 화면

**A. 개인 대시보드**
- 본인의 담당제품, 담당업무 목록 표시
- 다른 파트원의 정보는 접근 불가

**B. 검토요청**
- 제목, 설명, 첨부파일(또는 링크)로 검토 요청 작성
- 본인이 올린 요청 목록과 상태, 파트장 피드백 확인

**C. 배정 업무**
- 본인에게 배정된 프로젝트(논루틴 업무) 목록, 설명, 마감일 확인

## 4. 데이터 모델 (제안)

### users
| 필드 | 타입 | 설명 |
|---|---|---|
| id | uuid (PK) | |
| email | text | 로그인 ID |
| name | text | 이름 |
| role | enum: leader / member | |
| created_at | timestamp | |

### products (제품 마스터)
| 필드 | 타입 | 설명 |
|---|---|---|
| id | uuid (PK) | |
| name | text | 제품명 |
| code | text (nullable) | 제품코드 |

### product_assignments (담당제품)
| 필드 | 타입 | 설명 |
|---|---|---|
| id | uuid (PK) | |
| user_id | uuid (FK→users) | |
| product_id | uuid (FK→products) | |
| status | text (nullable) | 진행중/완료 등 |

### duties (담당업무 카테고리)
| 필드 | 타입 | 설명 |
|---|---|---|
| id | uuid (PK) | |
| name | text | 예: 품질기록 검토, 공급업체평가 |

### duty_assignments (담당업무 배정)
| 필드 | 타입 | 설명 |
|---|---|---|
| id | uuid (PK) | |
| user_id | uuid (FK→users) | |
| duty_id | uuid (FK→duties) | |

### review_requests (검토요청)
| 필드 | 타입 | 설명 |
|---|---|---|
| id | uuid (PK) | |
| requester_id | uuid (FK→users) | 요청한 파트원 |
| title | text | |
| description | text | |
| attachment_url | text (nullable) | |
| status | enum: pending / approved / rejected | |
| created_at | timestamp | |
| updated_at | timestamp | |

### review_feedback (검토 피드백)
| 필드 | 타입 | 설명 |
|---|---|---|
| id | uuid (PK) | |
| review_request_id | uuid (FK) | |
| leader_id | uuid (FK→users) | |
| comment | text | |
| created_at | timestamp | |

### projects (프로젝트성 / 논루틴 업무)
| 필드 | 타입 | 설명 |
|---|---|---|
| id | uuid (PK) | |
| name | text | |
| description | text | |
| deadline | date (nullable) | |
| status | enum: planned / in_progress / done | |
| created_by | uuid (FK→users) | 생성한 파트장 |

### project_assignments (프로젝트 배정)
| 필드 | 타입 | 설명 |
|---|---|---|
| id | uuid (PK) | |
| project_id | uuid (FK) | |
| user_id | uuid (FK) | |
| notes | text (nullable) | |

## 5. 핵심 워크플로우

### 5.1 검토요청 → 피드백
1. 파트원이 검토요청 작성 (제목/설명/첨부 선택) → status: `pending`
2. 파트장 대시보드에 신규 요청 표시
3. 파트장이 `pending` 상태에서 피드백을 작성하며 검토 진행 (상태는 `pending` 유지)
4. 파트장이 상태를 `approved` 또는 `rejected`로 변경
5. 파트원 화면에서 본인 요청에 달린 피드백과 최종 상태 확인

### 5.2 프로젝트 배정
1. 파트장이 프로젝트 생성 (이름/설명/마감일)
2. 파트원 1명 이상 배정
3. 파트장 화면: 프로젝트별·인원별 배정 현황 확인
4. 파트원 화면: 본인에게 배정된 프로젝트만 노출

## 6. 권한 모델 (Row Level Security 기준)

| 테이블 | 파트원 | 파트장 |
|---|---|---|
| users | 본인 행만 조회 | 전체 조회 |
| product_assignments / duty_assignments | 본인 것만 조회 | 전체 조회·수정 |
| review_requests | 본인이 작성한 것만 조회·생성 | 전체 조회, 상태 변경 |
| review_feedback | 본인 요청에 달린 것만 조회 | 전체 조회·생성 |
| projects / project_assignments | 본인이 배정된 것만 조회 | 전체 조회·생성·수정 |

Supabase 사용 시 위 규칙을 Row Level Security 정책으로 구현하면 프론트엔드 코드에 권한 분기 로직 없이도 DB 단에서 안전하게 강제할 수 있습니다.

## 7. 기술 스택 및 호스팅

| 영역 | 추천 | 비고 |
|---|---|---|
| 프론트엔드 | React + Vite (SPA) | 대시보드형 서비스라 SSR 불필요 |
| 백엔드/DB/인증 | Supabase (Postgres + Auth) | 무료 티어, RLS로 권한 분리 |
| 호스팅 | Cloudflare Workers | 무료, 사내(상업적) 사용 명시적으로 허용 (`wrangler deploy --assets`) |
| 대안 호스팅 | Vercel | 더 흔한 조합이지만 Hobby(무료) 플랜은 비상업적 개인용도로 제한 – 사내 시스템이면 Pro($20/월) 권장 |
| 인증 방식 | 이메일 + 비밀번호 | 10인 규모라 SSO 불필요 |

## 8. 가정 사항 (확인 필요)

Codex에 전달하기 전, 아래 중 실제와 다른 부분이 있으면 수정해 주세요.

1. "논루틴 업무"(파트원 화면 용어)와 "프로젝트성 업무"(파트장 화면 용어)는 동일한 개념으로 간주하고 `projects` 테이블로 통합함
2. 담당제품은 인당 여러 개 배정 가능하며, 배정별 상태값(진행중/완료 등)이 존재한다고 가정
3. 담당업무는 사전 정의된 카테고리 목록에서 배정하는 방식으로 가정 (자유 텍스트 아님)
4. 검토요청에는 파일 첨부와 텍스트 설명 둘 다 가능하다고 가정
5. 검토요청 상태는 대기중/완료/반려 3단계(`pending`/`approved`/`rejected`)로 가정
6. 별도 이메일 알림은 1차 범위에서 제외, 로그인 후 화면에서 확인하는 것으로 가정
7. 프로젝트 배정은 단순 배정 여부만 관리
8. 프로젝트 생성·배정 권한은 파트장에게만 있다고 가정
9. 초기 데이터(인원/제품/업무)는 파트장이 화면에서 직접 입력하는 것으로 가정 (엑셀 일괄 업로드는 1차 범위에서 제외)
