# 테스트 계획

## 앱 기능

- 파트장 화면에서 초대 사용자, 제품, 업무, 담당제품, 담당업무, 프로젝트, 프로젝트 배정을 생성한다.
- 파트원 화면에서 본인 담당제품/담당업무/프로젝트만 보이는지 확인한다.
- 파트원이 검토요청을 생성하면 상태가 `대기중`으로 표시된다.
- 파트원이 검토요청을 생성할 때 검토 기한은 `기한없음` 또는 날짜 중 하나만 선택할 수 있고, 날짜 선택 시 목록과 우선처리 큐에 기한이 보인다.
- 파트장/파트원 검토요청 목록에서 상태 필터(`전체`, `대기중`, `검토중`, `완료`, `반려`)가 목록을 정확히 좁히는지 확인한다.
- 파트장 대시보드의 `우선처리 큐`는 기한이 임박했거나 오래 대기 중인 검토요청을 프로젝트 마감/기초데이터 누락보다 먼저 보여준다.
- 파트장이 검토요청 상태를 `검토중`, `완료`, `반려`로 변경할 수 있다.
- 파트장이 피드백을 여러 개 남기면 파트원 화면에 이력으로 보인다.
- 프로젝트 배정 화면의 파트원 선택 목록에는 `member` 역할 사용자만 보인다.
- 파트장이 프로젝트 카드에서 이름, 마감일, 상태, 설명을 수정하면 프로젝트 현황과 파트원 배정 업무에 반영된다.
- 대시보드 `최근 활동`에는 검토요청 생성, 상태 변경, 피드백, 프로젝트 생성/배정/수정이 시간순으로 보인다.
- 파트원 대시보드의 `내 알림/리마인더`에는 본인 검토요청 기한과 미완료 프로젝트 마감이 보인다.
- 기초데이터 삭제 아이콘은 첫 클릭에서 바로 삭제하지 않고, 같은 행의 `삭제 확인`을 눌렀을 때만 삭제한다.

## RLS 수동 검증

Supabase에 최소 3명(`leader`, `member A`, `member B`)을 등록한 뒤 각 계정으로 로그인한다.

- `member A`는 `member B`의 `profiles`, `product_assignments`, `duty_assignments`, `review_requests`, `project_assignments`를 볼 수 없어야 한다.
- `leader`는 전체 `profiles`, 배정, 검토요청, 프로젝트를 조회하고 수정할 수 있어야 한다.
- `member A`가 `requester_id`를 `member B`로 넣어 검토요청을 생성하려 하면 RLS가 거부해야 한다.
- `member A`가 검토요청을 만들 때 `due_date`는 날짜 또는 `null`로 저장되고, 다른 사용자의 요청에는 여전히 접근할 수 없어야 한다.
- `member`가 `products`, `duties`, `projects`, `project_assignments`를 생성/수정/삭제하려 하면 RLS가 거부해야 한다.
- `leader`는 프로젝트 상태/마감일/설명을 수정할 수 있고, `member`는 프로젝트를 수정할 수 없어야 한다.
- `leader`가 `project_assignments.user_id`에 leader 계정을 넣어 배정하려 하면 DB trigger/RLS가 거부해야 한다.
- `leader`가 `projects.created_by`에 member 계정을 넣어 프로젝트를 만들려 하면 DB trigger/RLS가 거부해야 한다.
- `profile_notes.profile_id`는 member, `profile_notes.leader_id`와 `review_feedback.leader_id`는 leader만 허용되는지 확인한다.
- `activity_logs`는 leader가 전체를 조회하고, member는 본인이 actor이거나 target인 로그만 조회할 수 있어야 한다.
- `member`가 `activity_logs.target_user_id`를 임의로 지정해 insert하려 하면 RLS가 거부해야 한다.

## 로컬 검증 명령

```bash
npm install
npm test
npm run build
npm run dev
```
