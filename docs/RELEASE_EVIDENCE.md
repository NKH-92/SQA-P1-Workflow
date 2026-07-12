# 소규모 사내 운영 릴리스 체크리스트

이 문서는 파트원만 사용하는 소규모 사내 시스템의 실제 출시 기준이다. 로컬
빌드 성공을 운영 승인으로 오해하지 않되, 대규모 조직용 통제는 선택 운영으로
분리한다.

## 현재 로컬 후보 (2026-07-12)

- [x] 변경은 `codex/improvement-hardening` 브랜치에만 격리했다.
- [x] Worker 배포, 원격 migration/DB 변경, commit, push를 수행하지 않았다.
- [x] TypeScript, ESLint, Vitest(53 files / 266 tests passed; 4 files / 22
      tests skipped), production build, dependency audit, workflow YAML parsing,
      Node syntax 검사와 `git diff --check`가 로컬에서 통과했다.
- [x] 필수 Supabase 환경이 없으면 RLS 테스트가 skip/green 처리되지 않고
      fail-closed 한다.

## 필수 출시 게이트

아래 항목과 **파트장 1인의 최종 승인**만 소규모 사내 운영의 출시 차단
조건이다.

- [ ] 후보 SHA의 CI, typecheck, lint, unit test, production build가 모두 green.
- [ ] 격리된 Supabase에서 migration 전체 적용 및 `npm run test:rls`가 skip 없이
      green. anon/member/leader 및 비활성 사용자 핵심 허용·거부 시나리오 확인.
- [ ] 운영 DB 암호화 백업이 성공했고 암구호 접근 가능 여부와 기본 복원 명령을
      확인. 매번 전체 복원 훈련을 할 필요는 없다.
- [ ] 배포·DB migration workflow가 설정 누락, DB readiness 실패, 테스트 실패를
      green으로 우회하지 않고 중단.
- [ ] 운영 Supabase URL/DB 연결이 같은 프로젝트를 가리키는지 확인.
- [ ] 외부에서 접근 가능한 Worker/도메인은 Cloudflare Access 등으로 파트원만
      접근 가능하며, 우회 가능한 다른 hostname이 없음.
- [ ] 파트장이 변경 요약, 백업 run, RLS 결과, 롤백 명령을 짧은 체크리스트로
      확인하고 1인 승인.
- [ ] 배포 직후 로그인, 목록 조회, 대표 mutation 1건, 보안 헤더를 smoke test.

## 기본 롤백

- 프런트 문제: 이전 정상 Worker version을 즉시 재배포한다.
- DB 문제: 추가 쓰기와 후속 migration을 중단하고 최신 암호화 백업 및
  `docs/OPERATIONS.md` 절차를 사용한다.
- 새 migration은 append-only로 유지하며, 검증 없이 운영 이력을 repair하지 않는다.

## 알려진 위험과 수용 범위

- `mark_password_changed()`는 Auth 비밀번호 변경과 서버 트랜잭션으로 묶이지
  않았다. 이 우회는 인증 게이트에 관한 미해결 보안 항목이므로 출시 전에
  해결하거나 파트장이 명시적으로 위험을 수용해야 한다.
- public `activity_logs`는 운영 편의용 UX 이력이다. 모든 변경을 입증하는
  authoritative audit로 사용하지 않는다. 핵심 private trigger는 live RLS 검증
  대상이지만 전 변경 상세 감사는 필수 출시 조건이 아니다.
- migration `202607110010`과 이미 열린 구버전 탭은 review activity 로그를
  중복 생성할 수 있다. 배포 전에 사용자에게 탭 새로고침/재로그인을 공지하고,
  짧은 유지보수 창에 migration 후 프런트를 순서대로 반영한다.
- legacy 2-argument project assignment RPC는 구버전 호환용이며 새 OCC 계약이
  없다. 완전 무중단 공존 증명 대신 유지보수 창과 열린 탭 종료를 운영 기준으로
  사용한다.
- DB dump는 애플리케이션 DB를 대상으로 한다. managed Auth와 Storage 객체는
  별도 복구 범위이며, 첨부파일 미백업은 기존 운영 정책에 따라 수용한다.

## 선택 운영 개선

다음은 권장하지만 이번 소규모 사내 릴리스의 차단 조건은 아니다.

- 복수 승인자와 별도 change board
- 모든 변경의 상세·불변 감사 이력
- 정기 전체 복원 훈련 및 장기 증빙 보관
- 구버전 열린 탭까지 포함한 완전 무중단 전환
- production-sized 부하·장기 성능 시험
- 대규모 조직용 운영 문서와 보고 체계

필수 출시 게이트가 하나라도 미확인인 동안 상태는 **keep isolated / do not
deploy**이다. 선택 운영 개선의 미완료만으로는 배포를 차단하지 않는다.
