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
