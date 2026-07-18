# SQA P1 Workflow 로드맵

## CAPA 2026-07-18 실행 상태

| 패키지 | 상태 | 비고 |
|---|---|---|
| Phase 0 | 완료(로컬) / CI 재실행 대기 | 기준 SHA 로컬 gate green, GitHub runner provisioning failure 증적 |
| WP1 audit integrity v3 | 로컬 구현 완료 / RLS CI 대기 | append-only migration, UI, contract/RLS test, readiness gate |
| WP2–WP7 | 대기 | 선행 PR merge SHA green 후 순차 진행 |
| WP8 Stage B | 운영자 승인 대기 | WP3 운영 배포·rollback window 종료·최신 backup 증적 전 merge 금지 |

- 현재 위치: **Phase 0(운영 배포) 완료 — 2026-07-09 서명** ([MANUAL_TASKS_PLAN.md](./MANUAL_TASKS_PLAN.md) 최종 서명·추가 배포 기록 참조). Phase 1(파일럿·운영 안착)이 다음 단계다.
- 우선순위: ① 배포·운영 안착 → ② 알림 강화 → ③ 품질·테스트 보강 (통계·보고 확장은 후순위 보류).
- 원칙: 사용자 10명, **전 구간 무료 티어 유지** (Supabase Free + Cloudflare Workers Free + GitHub Free).

---

## Phase 0 — 운영 배포 (1일 집중, 최우선)

[MANUAL_TASKS_PLAN.md](./MANUAL_TASKS_PLAN.md)의 0·A~G를 실제로 수행하고 서명한다. 코드 작업이 아니라 **콘솔 작업 + 검증**이다.

> 작업 F의 RLS 수동 검증에는 **비밀번호 변경 강제(RLS 차단) 검증**이 포함된다([TEST_PLAN.md](./TEST_PLAN.md) 참조).

| 순서 | 작업 | 수행 주체 | 비고 |
|:---:|------|-----------|------|
| A | git push + CI green 확인 | 파트장 (Claude 보조) | 로컬은 이미 그린 |
| B | GitHub Variables 3개 + Secrets 4개 등록 | 파트장 | 배포 2 + 백업 2. anon key만, service_role 금지 |
| C | Supabase 마이그레이션 적용(당시 29개) + 확인 SQL | 파트장 (Claude가 확인 SQL 준비) | [SUPABASE_MIGRATIONS.md](./SUPABASE_MIGRATIONS.md) 목록 기준 |
| D | Auth 설정(가입 차단·Site URL) + leader 1 / member 2 계정 | 파트장 | public sign-up **OFF** — Access 미사용의 전제 조건 |
| E | Workers 배포 + 스모크 | 파트장 (Claude가 체크리스트 제공) | 보안 헤더(`_headers`) 적용 여부 확인 포함 |
| F | RLS 수동 검증 (TEST_PLAN.md) | 파트장 | 3계정 매트릭스 |
| G | 백업 1회 + 복구 리허설 | 파트장 (에이전트가 절차 안내) | 매일 자동 암호화 백업(Actions)이 기본 — 첫 실행·복구를 여기서 검증 |

**완료 기준**: MANUAL_TASKS_PLAN 하단 서명란 기입 (완료일·운영 URL·HEAD SHA).

---

## Phase 1 — 파일럿·운영 안착 (2주)

"배포된 앱"을 "매일 쓰는 도구"로 만드는 단계. 코드보다 운영 장치가 중심이다.

### 1주차 — 소규모 파일럿 (파트장 + 파트원 2~3명)
- [ ] 온보딩 키트 작성: 1페이지 사용 가이드 (`docs/USER_GUIDE.md` — 로그인·비밀번호 변경·검토요청 올리기·뱃지 확인·자료는 사내 메신저로 전달)
- [ ] 실제 검토요청 3건 이상을 시스템으로만 처리해보기 (메신저 병행 금지 실험)
- [ ] 발견되는 문제·불편을 GitHub Issues에 즉시 기록 (라벨: `pilot`)

### 2주차 — 전원 확대 (10명)
- [ ] 파트원 전원 초대 등록 + 첫 로그인 완료 확인 (임시 비밀번호 → 변경 강제 흐름)
- [ ] 운영 선언: "검토요청·프로젝트 배정은 이 시스템이 단일 창구"
- [ ] 운영 루틴 시작: **매일 자동 백업(Actions, 05:00 KST) green 확인** ([OPERATIONS.md](./OPERATIONS.md)) + 주 1회 10분 회고(불편사항 수집)

### 성공 지표 (2주차 말 측정)
- 파트원 전원이 검토요청 1건 이상 생성
- 대기(pending) 요청의 평균 처리일 파악 가능 (통계 화면 활용)
- 백업 파일 2개 이상 보관

**완료 기준**: 2주 연속 전원 사용 + "시스템 밖에서 처리된 검토요청 0건"에 근접.

---

## Phase 2 — 알림 강화 (파일럿 이후 1~2주)

앱 안에는 미확인 뱃지·알림 패널이 있지만, 어느 쪽이든 로그인해야 보인다. 로그인 없이도 변화를 인지하게 만든다.

> **2026-07-10 선반영 (브라우저 도달 구간)**: 딥링크 공유(검토·프로젝트 "링크 복사"), 백그라운드 동기화(5분 안전망 폴링 + 창 복귀 재조회), 검토요청 INSERT Realtime 즉시 반영, 파트장 전용 크롬 데스크톱 알림(벨 패널에서 옵트인). Realtime은 마이그레이션 `202607090001`의 **운영 적용이 전제** — 적용 여부·기록은 [MANUAL_TASKS_PLAN.md](./MANUAL_TASKS_PLAN.md) "추가 배포 기록" 참조. 아래 이메일·메신저 채널은 **브라우저를 닫았을 때의 도달**용으로 남는다.

### 선결정 (파일럿 중 확인)
- [ ] **도달 채널 결정**: 사내에서 실제로 확인하는 채널이 무엇인가 — 이메일 / Teams·Slack 등 메신저 웹훅 / 둘 다. (사내망 정책상 외부 웹훅 차단 여부도 확인)

### 구현 (전부 무료 티어 내)
1. **1단계 — 아침 요약 (권장 시작점)**: Supabase `pg_cron` + Edge Function으로 평일 아침 1회 발송
   - 파트장에게: 대기 검토 n건, 기한 임박 요청·프로젝트
   - 파트원에게: 새 피드백·종결 결과, 마감 임박 프로젝트
   - 발송 수단: Resend 무료(일 100통 — 10명 일 1회면 충분) 또는 사내 SMTP, 메신저면 incoming webhook
2. **2단계 — 이벤트 즉시 알림 (선택)**: 새 검토요청 → 파트장, 상태 종결 → 요청자
   - 알림 피로 방지를 위해 옵트인으로 설계

**완료 기준**: 파트원이 로그인하지 않은 날에도 자기 요청의 종결 사실을 아는 상태.
**리스크**: Edge Function·외부 발송은 새 인프라 — 실패해도 앱 본 기능에 영향 없도록 완전 분리 (알림 실패는 조용히 로그만).

---

## Phase 3 — 품질·테스트 보강 (상시, 격주 1작업)

파일럿과 병행 가능. 회귀 방지 체계를 두껍게 만든다.

| 순번 | 작업 | 내용 |
|:---:|------|------|
| 1 | Playwright E2E 스모크 | 데모 모드 기반이라 서버 없이 CI에서 실행 가능 — leader/member 전 탭 순회 + 검토요청 생성→피드백→종결 1루프 |
| 2 | ProjectsPanel 컴포넌트 테스트 | 배정 편집 diff·프로젝트 삭제 2단계 확인 (ReviewsPanel 테스트 패턴 재사용) |
| 3 | MasterPanel 컴포넌트 테스트 | 인라인 수정·CSV 가져오기·초대 비활성화 토글 |
| 4 | master/team 뮤테이션 repository 완전 위임 | 데이터 레이어 내부의 `ctx.isRemote` 인라인 분기를 repository 클래스로 이관 |
| 5 | 월 1회 의존성 업데이트 루틴 | `npm outdated` 확인 → 마이너 업데이트 → 전체 테스트 → 데모 스모크 |

**완료 기준**: CI에 E2E 스모크 포함, 주요 4개 화면(Reviews·Projects·Master·Team) 렌더 테스트 존재.

---

## 상시 — 무료 티어 가드레일

월 1회 점검 (OPERATIONS.md 루틴에 편입):

| 항목 | 한도 (Free) | 점검 방법 | 주의 |
|------|-------------|-----------|------|
| Supabase DB | 500MB | Dashboard → Database → 사용량 | 10명 규모로는 수년치 여유 |
| Supabase Storage | 1GB | Dashboard → Storage | 리뷰 첨부 기능 폐지. 승인된 purge와 Stage B 배포 후 `review-attachments` 버킷이 없어야 하며 신규 앱 버킷을 만들지 않음 |
| Supabase 프로젝트 일시정지 | **7일 비활성 시 자동 pause** | — | 장기 연휴 주의 — 재개 절차는 [OPERATIONS.md](./OPERATIONS.md) 장애 확인 순서 참고 |
| Supabase 자동 백업 | 없음 (Free 내장 백업 없음) | Actions **Backup DB** run green 확인 | 매일 자동 암호화 DB 백업(아티팩트 90일)이 복구 수단. 폐기 전 기존 Storage 객체는 별도 승인·보존 판단 필요([OPERATIONS.md](./OPERATIONS.md)) |
| Cloudflare Workers | 10만 요청/일 | Dashboard → Workers 메트릭 | 10명 규모로는 도달 불가 |

---

## 하지 않기로 한 것

- **Cloudflare Access**: Worker/도메인이 인터넷에서 접근 가능하면 파트원만 허용하도록 필수 적용한다. 내부망에서만 접근 가능하고 외부 경로가 없다는 증거가 있을 때만 생략한다. Supabase public sign-up OFF와 초대제는 앱 계정 통제이며 HTTP 주소 자체의 외부 접근 제한을 대체하지 않는다.
- **상태관리 라이브러리·react-query·전면 리디자인·path 라우터**: 10인 규모에 과설계로 판단, 도입하지 않는다.
- **4px 그리드 전환**: 전면 리디자인 범위라 보류 — 현재의 광학 보정 간격 체계를 유지한다([DESIGN.md](../DESIGN.md) 참조).
- **통계·보고 확장**: 우선순위 보류 — 파일럿에서 실수요 확인 후 재검토.

---

## 진행 순서 요약

```
Phase 0 (1일)   배포 A~G 수행·서명           ✓ 2026-07-09 완료
Phase 1 (2주)   파일럿 → 전원 확대 → 운영 루틴  ← 지금 여기
Phase 2 (1~2주) 아침 요약 알림 → (선택) 즉시 알림
Phase 3 (상시)  E2E 스모크 → 화면 테스트 확장 → 리팩토링 마무리
```
