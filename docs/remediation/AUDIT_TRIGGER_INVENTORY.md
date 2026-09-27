# Private mutation audit trigger inventory

This inventory is derived from the applied migration trigger definitions, not from the
frontend entity-type union. `private.build_audit_business_snapshot()` is the authoritative
allowlist for audit schema v3; a new trigger entity that is not added there fails the
originating mutation closed.

| Trigger entity | Table | Preserved business fields | Deliberately excluded |
|---|---|---|---|
| `profile` | `public.profiles` | identity, email, name, role, password-change/access flags, creation time | `updated_at`; authentication internals never exist in this row |
| `allowed_user` | `public.allowed_users` | identity, email, name, role, creator, creation time | any future credential/token fields |
| `profile_note` | `public.profile_notes` | identity, subject, leader, note, creation time | future arbitrary metadata |
| `product` | `public.products` | identity, name, category/company, unassigned reason, order, creation time | `updated_at` noise |
| `product_assignment` | `public.product_assignments` | identity, user, product, creation time | `updated_at` noise |
| `duty_major_category` | `public.duty_major_categories` | identity, name, order, creation time | `updated_at` noise |
| `duty` | `public.duties` | identity, name, parent, order, label, notes, creation time | `updated_at` noise |
| `duty_assignment` | `public.duty_assignments` | identity, user, duty, creation time | future arbitrary metadata |
| `review_request` | `public.review_requests` | requester, content, due/status lifecycle, rounds, withdrawal evidence, creation time | removed attachment URL; `updated_at` noise |
| `review_feedback` | `public.review_feedback` | request, author/role, comment, void evidence, creation time | `updated_at` noise |
| `project` | `public.projects` | identity, name, description, deadline, status, creator, creation time | `updated_at` noise |
| `project_assignment` | `public.project_assignments` | identity, project, user, notes, creation time | `updated_at` noise |
| `announcement` | `public.announcements` | identity, title/body, pin state, creator, creation time | `updated_at` noise |
| `change_application` | `public.change_applications` | common content and publish/cancel/archive lifecycle evidence | `updated_at` noise |
| `change_action_item` | `public.change_action_items` | parent, kind/content, due date, order, creation time | `updated_at` noise |
| `product_change_task` | `public.product_change_tasks` | scope, assignee, status, completion/cancel/restore/reopen evidence | `updated_at` noise |

The helper never copies an entire JSON row and never copies arbitrary `metadata`. Fields
named password, encrypted password, token, secret, service key, session, or credential are
absent from every allowlist. Adding such a column in the future therefore does not expose
it automatically.

`public.office_seats`(홈 도트 사무실 자리 배치)는 업무 데이터가 아닌 장식 배치라 private 감사 트리거를
두지 않는다. 행에 `updated_by`·`updated_at`을 남기고, 쓰기는 파트장 전용 `replace_office_seats` RPC 하나뿐이다.
`public.section_read_marks`(홈 사무실 기물 알림용 사람별 확인 기록)도 `review_read_receipts`처럼 개인 읽음 상태라
감사 트리거를 두지 않는다. 본인 기록만 `mark_section_seen` RPC로 바꾸고, 팀장은 쓰기 차단 트리거로 막힌다.
`public.office_meetings`·`public.office_meeting_participants`(홈 사무실 인스턴트 회의)도 끝나면 지워지는 일시적인 조율이라
감사 트리거를 두지 않는다. 쓰기는 회의 시작·확인·완료 RPC뿐이고 팀장은 쓰기 차단 트리거로 막힌다.
`public.member_statuses`·`public.member_leaves`(홈 사무실 자리 상태: 잠깐 비움·휴가·출장)도 지나면 사라지는 조율 정보라
감사 트리거를 두지 않는다. 행에 `set_by`·`created_by`와 시각을 남기고, 쓰기는 본인·파트장만 부르는 상태 RPC뿐이며
끝난 휴가·출장은 다음 쓰기에서 지운다. 팀장은 쓰기 차단 트리거로 막힌다.
따라서 `scripts/sql/verify/50_audit_v3.sql`의 감사 트리거 수(16)는 그대로다.
