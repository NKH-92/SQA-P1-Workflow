# 테스트 계획

## 앱 기능

- 파트장 화면에서 초대 사용자, 제품, 업무, 담당제품, 담당업무, 프로젝트, 프로젝트 배정을 생성한다.
- 파트원 화면에서 본인 담당제품/담당업무/프로젝트만 보이는지 확인한다.
- 파트원이 검토요청을 생성하면 상태가 `대기중`으로 표시된다.
- 파트장이 검토요청 상태를 `검토중`, `완료`, `반려`로 변경할 수 있다.
- 파트장이 피드백을 여러 개 남기면 파트원 화면에 이력으로 보인다.

## RLS 수동 검증

Supabase에 최소 3명(`leader`, `member A`, `member B`)을 등록한 뒤 각 계정으로 로그인한다.

- `member A`는 `member B`의 `profiles`, `product_assignments`, `duty_assignments`, `review_requests`, `project_assignments`를 볼 수 없어야 한다.
- `leader`는 전체 `profiles`, 배정, 검토요청, 프로젝트를 조회하고 수정할 수 있어야 한다.
- `member A`가 `requester_id`를 `member B`로 넣어 검토요청을 생성하려 하면 RLS가 거부해야 한다.
- `member`가 `products`, `duties`, `projects`, `project_assignments`를 생성/수정/삭제하려 하면 RLS가 거부해야 한다.

## 로컬 검증 명령

```bash
npm install
npm test
npm run build
npm run dev
```
