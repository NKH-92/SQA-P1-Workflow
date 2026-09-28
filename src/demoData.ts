import type {
  AllowedUser,
  Announcement,
  AppData,
  ChangeActionItem,
  ChangeApplication,
  ChangeAssigneeOption,
  ChangeProductScopeRow,
  Duty,
  DutyAssignment,
  DutyMajorCategory,
  Product,
  ProductAssignment,
  ProductChangeTask,
  Profile,
  OfficeLayout,
  ProfileNote,
  Project,
  ProjectAssignment,
  ProjectStatus,
  ReviewRequest,
  ReviewEvent,
  ActivityLog,
  SectionReadMark,
  MemberPresence,
} from './types'
import { businessDateKey } from './lib/businessTime'
import { demoProductAllocationRows } from './demo/anonymousProductAllocation'
import { selectLeaderChangeActions, selectMemberPendingTasks } from './domain/changeApplications/attention'
import {
  demoDutyAllocationRows,
  isDirectDutyAssignee,
  listDutyMajorCategories,
  resolveDutyAssigneeLabel,
} from './demo/anonymousDutyAllocation'

const createdAt = '2026-07-02T00:00:00.000Z'

export const previewLeader: Profile = {
  id: 'demo-leader',
  email: 'preview-leader@example.com',
  name: '미리보기 파트장',
  role: 'leader',
}

function listPreviewMembers(): Profile[] {
  const demoAssigneeNames = Array.from(
    new Set(demoProductAllocationRows.map((row) => row.assigneeName.trim()).filter(Boolean)),
  )
  return demoAssigneeNames.map((name, index) => ({
    id: `member-${String(index + 1).padStart(2, '0')}`,
    email: `member-${String(index + 1).padStart(2, '0')}@example.com`,
    name,
    role: 'member',
  }))
}

const extraPreviewProfiles: Profile[] = [
  {
    id: 'member-extra-01',
    email: 'member-extra-01@preview.local',
    name: '파트원 C',
    role: 'member',
  },
]

function listPreviewProfiles(members: Profile[]) {
  return [...members, ...extraPreviewProfiles].filter(
    (profile, index, profiles) => profiles.findIndex((item) => item.name === profile.name) === index,
  )
}

// 최상위 계산은 미리보기에서만 쓴다. /* @__PURE__ */ 표시로 결과를 쓰지 않는 운영 번들에서는
// 계산과 데모 제품 데이터가 함께 트리셰이킹된다. 내보내는 값과 계산 결과는 그대로다.
const previewMembers: Profile[] = /* @__PURE__ */ listPreviewMembers()

const previewProfiles = /* @__PURE__ */ listPreviewProfiles(previewMembers)

function previewProfileByName(name: string) {
  return previewProfiles.find((profile) => profile.name === name)
}

function firstPreviewMember(members: Profile[]): Profile {
  return members[0]
}

export const previewMember: Profile = /* @__PURE__ */ firstPreviewMember(previewMembers)

const projectNames = [
  '고객 포털 개편',
  '정산 자동화',
  '파트너 API 전환',
  '모바일 알림 고도화',
  '운영 리포트 통합',
  '권한 체계 정비',
  '레거시 화면 개선',
  '데이터 품질 점검',
]
const projectStatuses: ProjectStatus[] = ['planned', 'in_progress', 'done']

function seededRandom(seed: number) {
  let value = seed
  return () => {
    value += 0x6d2b79f5
    let next = Math.imul(value ^ (value >>> 15), value | 1)
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61)
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296
  }
}

function shuffle<T>(items: T[], random: () => number): T[] {
  const copy = [...items]
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1))
    const item = copy[index]
    copy[index] = copy[swapIndex]
    copy[swapIndex] = item
  }
  return copy
}

function pickUnique<T>(items: T[], count: number, random: () => number): T[] {
  return shuffle(items, random).slice(0, count)
}

export function createPreviewData(): AppData {
  const random = seededRandom(20260702)

  const products: Product[] = demoProductAllocationRows.map((row, index) => ({
    id: `product-${String(index + 1).padStart(3, '0')}`,
    name: row.productName,
    category: row.category,
    company_name: row.companyName,
    sort_order: index + 1,
    created_at: createdAt,
    updated_at: createdAt,
  }))

  const dutyMajorCategories: DutyMajorCategory[] = listDutyMajorCategories().map((name, index) => ({
    id: `duty-major-${String(index + 1).padStart(2, '0')}`,
    name,
    sort_order: index + 1,
    created_at: createdAt,
    updated_at: createdAt,
  }))

  const majorCategoryIdByName = Object.fromEntries(dutyMajorCategories.map((category) => [category.name, category.id]))

  const duties: Duty[] = demoDutyAllocationRows.map((row, index) => {
    const majorCategory = dutyMajorCategories.find((category) => category.name === row.majorCategory)
    return {
      id: `duty-${String(index + 1).padStart(2, '0')}`,
      name: row.dutyName,
      major_category_id: majorCategoryIdByName[row.majorCategory],
      sort_order: index + 1,
      assignee_label: resolveDutyAssigneeLabel(row.assigneeName),
      notes: row.notes,
      created_at: createdAt,
      updated_at: createdAt,
      duty_major_categories: majorCategory
        ? { name: majorCategory.name, sort_order: majorCategory.sort_order ?? null }
        : null,
    }
  })

  const projects: Project[] = projectNames.map((name, index) => ({
    id: `project-${String(index + 1).padStart(2, '0')}`,
    name,
    description: `${name} 관련 산출물과 배정 현황을 관리합니다.`,
    deadline: `2026-07-${String(10 + index * 2).padStart(2, '0')}`,
    status: projectStatuses[index % projectStatuses.length],
    created_by: previewLeader.id,
    created_at: createdAt,
    updated_at: createdAt,
  }))

  const productAssignments: ProductAssignment[] = demoProductAllocationRows.flatMap((row, index) => {
    const member = previewProfileByName(row.assigneeName)
    const product = products[index]
    if (!member || !product) return []
    return [
      {
        id: `product-assignment-${String(index + 1).padStart(3, '0')}`,
        user_id: member.id,
        product_id: product.id,
        created_at: createdAt,
        updated_at: createdAt,
        profiles: { name: member.name, email: member.email },
        products: {
          name: product.name,
          category: product.category,
          company_name: product.company_name,
          sort_order: product.sort_order,
        },
      },
    ]
  })

  const changeApplications: ChangeApplication[] = [
    {
      id: 'change-application-01',
      change_number: 'CC-2026-014',
      source: 'official',
      title: '원료 제조원 변경',
      summary: '공급처 변경에 따라 제품표준서의 원료 제조원 정보를 변경합니다.',
      source_url: 'https://example.com/change/CC-2026-014',
      effective_date: '2026-08-01',
      status: 'published',
      content_locked_at: '2026-07-18T04:00:00.000Z',
      created_by: previewLeader.id,
      published_at: '2026-07-15T01:00:00.000Z',
      cancelled_at: null,
      cancellation_reason: null,
      created_at: '2026-07-15T01:00:00.000Z',
      updated_at: '2026-07-15T01:00:00.000Z',
      profiles: { name: previewLeader.name },
    },
    {
      id: 'change-application-draft-01',
      change_number: 'INT-2026-0001',
      source: 'internal',
      title: '표시기재 내부 점검',
      summary: '다음 배포 전에 제품별 표시기재를 확인합니다.',
      source_url: null,
      effective_date: '2026-08-10',
      status: 'draft',
      created_by: previewLeader.id,
      published_at: null,
      cancelled_at: null,
      cancellation_reason: null,
      created_at: '2026-07-16T02:00:00.000Z',
      updated_at: '2026-07-16T02:00:00.000Z',
      profiles: { name: previewLeader.name },
    },
  ]

  const changeActionItems: ChangeActionItem[] = [
    {
      id: 'change-action-01',
      change_application_id: 'change-application-01',
      kind: 'product_standard',
      custom_kind_name: null,
      content: '원료 제조원 및 소재지 정보를 제품표준서에 반영합니다.',
      due_date: '2026-07-28',
      sort_order: 1,
      created_at: '2026-07-15T01:00:00.000Z',
      updated_at: '2026-07-15T01:00:00.000Z',
    },
    {
      id: 'change-action-draft-01',
      change_application_id: 'change-application-draft-01',
      kind: 'other',
      custom_kind_name: '표시기재',
      content: '제품별 표시기재 최신본을 확인합니다.',
      due_date: '2026-08-05',
      sort_order: 1,
      created_at: '2026-07-16T02:00:00.000Z',
      updated_at: '2026-07-16T02:00:00.000Z',
    },
  ]

  const productChangeTasks: ProductChangeTask[] = products.slice(0, 12).map((product, index) => {
    const assignment = productAssignments.find((item) => item.product_id === product.id)
    const assignee = previewProfiles.find((item) => item.id === assignment?.user_id)
    const status = index === 0 ? 'completed' : index === 2 ? 'not_applicable' : 'pending'
    const completed = status !== 'pending'
    return {
      id: `product-change-task-${String(index + 1).padStart(2, '0')}`,
      action_item_id: 'change-action-01',
      product_id: product.id,
      product_name: product.name,
      assignee_id: assignee?.id ?? null,
      assignee_name: assignee?.name ?? null,
      status,
      product_note: null,
      completion_note: status === 'completed' ? '제품표준서 Rev.12 반영' : null,
      resolution_reason: status === 'not_applicable' ? '기존 제조원을 사용하지 않는 제품' : null,
      proxy_reason: null,
      completed_by: completed ? assignee?.id ?? previewLeader.id : null,
      completed_by_name: completed ? assignee?.name ?? previewLeader.name : null,
      completed_at: completed ? `2026-07-${String(18 + index).padStart(2, '0')}T04:00:00.000Z` : null,
      reopened_by: null,
      reopened_by_name: null,
      reopened_at: null,
      reopen_reason: null,
      created_at: '2026-07-15T01:00:00.000Z',
      updated_at: completed ? `2026-07-${String(18 + index).padStart(2, '0')}T04:00:00.000Z` : '2026-07-15T01:00:00.000Z',
      products: {
        name: product.name,
        category: product.category,
        company_name: product.company_name,
        sort_order: product.sort_order,
      },
    }
  })

  products.slice(-2).forEach((product, index) => {
    const assignment = productAssignments.find((item) => item.product_id === product.id)
    const assignee = previewProfiles.find((item) => item.id === assignment?.user_id)
    productChangeTasks.push({
      id: `product-change-draft-task-${index + 1}`,
      action_item_id: 'change-action-draft-01',
      product_id: product.id,
      product_name: product.name,
      assignee_id: assignee?.id ?? null,
      assignee_name: assignee?.name ?? null,
      status: 'pending',
      product_note: null,
      completion_note: null,
      resolution_reason: null,
      proxy_reason: null,
      completed_by: null,
      completed_by_name: null,
      completed_at: null,
      reopened_by: null,
      reopened_by_name: null,
      reopened_at: null,
      reopen_reason: null,
      created_at: '2026-07-16T02:00:00.000Z',
      updated_at: '2026-07-16T02:00:00.000Z',
      products: {
        name: product.name,
        category: product.category,
        company_name: product.company_name,
        sort_order: product.sort_order,
      },
    })
  })

  const changeProductScope: ChangeProductScopeRow[] = products.flatMap((product) => {
    const assignments = productAssignments.filter((item) => item.product_id === product.id)
    const rows = assignments.length > 0 ? assignments : [null]
    return rows.map((assignment) => {
      const assignee = previewProfiles.find((item) => item.id === assignment?.user_id)
      return {
        product_id: product.id,
        product_name: product.name,
        category: product.category ?? null,
        company_name: product.company_name ?? null,
        sort_order: product.sort_order ?? null,
        assignee_id: assignee?.id ?? null,
        assignee_name: assignee?.name ?? null,
      }
    })
  })

  const changeAssigneeOptions: ChangeAssigneeOption[] = [previewLeader, ...previewProfiles].map((profile) => ({
    id: profile.id,
    name: profile.name,
    role: profile.role,
  }))

  const dutyAssignments: DutyAssignment[] = demoDutyAllocationRows.flatMap((row, index) => {
    if (!isDirectDutyAssignee(row.assigneeName)) return []
    const member = previewProfileByName(row.assigneeName)
    const duty = duties[index]
    if (!member || !duty) return []
    return [
      {
        id: `duty-assignment-${String(index + 1).padStart(2, '0')}`,
        user_id: member.id,
        duty_id: duty.id,
        created_at: createdAt,
        profiles: { name: member.name, email: member.email },
        duties: {
          name: duty.name,
          major_category_id: duty.major_category_id,
          duty_major_categories: { name: duty.duty_major_categories?.name ?? row.majorCategory },
        },
      },
    ]
  })

  const projectAssignments: ProjectAssignment[] = previewMembers.flatMap((member, memberIndex) =>
    pickUnique(projects, 2, random).map((project, projectIndex) => ({
      id: `project-assignment-${memberIndex + 1}-${projectIndex + 1}`,
      project_id: project.id,
      user_id: member.id,
      notes: `${member.name} 담당 범위`,
      created_at: createdAt,
      updated_at: createdAt,
      profiles: { name: member.name, email: member.email },
      projects: {
        name: project.name,
        description: project.description,
        deadline: project.deadline,
        status: project.status,
      },
    })),
  )

  const reviewRequests: ReviewRequest[] = [
    {
      id: 'review-01',
      requester_id: 'member-01',
      title: '파트너 API 전환 검토',
      description: '전환 일정과 영향 범위 검토가 필요합니다.',
      due_date: '2026-07-05',
      status: 'pending',
      created_at: '2026-07-03T09:20:00.000Z',
      updated_at: '2026-07-03T09:20:00.000Z',
      profiles: { name: '파트원 A', email: 'member-01@example.com' },
      review_feedback: [],
    },
    {
      id: 'review-02',
      requester_id: 'member-02',
      title: '정산 자동화 화면 문구 확인',
      description: '파트너 안내 문구와 예외 케이스를 확인해 주세요.',
      due_date: null,
      status: 'pending',
      created_at: '2026-07-02T14:30:00.000Z',
      updated_at: '2026-07-03T10:10:00.000Z',
      profiles: { name: '파트원 B', email: 'member-02@example.com' },
      review_feedback: [
        {
          id: 'feedback-01',
          review_request_id: 'review-02',
          leader_id: previewLeader.id,
          comment: '정산 실패 케이스 문구를 한 번 더 보겠습니다.',
          created_at: '2026-07-03T10:10:00.000Z',
          profiles: { name: previewLeader.name },
        },
      ],
    },
    {
      id: 'review-03',
      requester_id: 'member-extra-01',
      title: '모바일 알림 고도화 정책 검토',
      description: '마감 전 알림 조건과 발송 제외 조건 검토 요청입니다.',
      due_date: '2026-07-09',
      status: 'pending',
      created_at: '2026-07-01T16:45:00.000Z',
      updated_at: '2026-07-01T16:45:00.000Z',
      profiles: { name: '파트원 C', email: 'member-extra-01@preview.local' },
      review_feedback: [],
    },
  ]

  const reviewEvents: ReviewEvent[] = reviewRequests.map((request, index) => ({
    id: index + 1,
    review_request_id: request.id,
    actor_id: request.requester_id,
    actor_name_snapshot: request.profiles?.name ?? '파트원',
    event_type: 'submitted',
    from_status: null,
    to_status: 'pending',
    occurred_at: request.created_at ?? createdAt,
    metadata: { estimated: false },
    transaction_id: index + 1,
  }))

  const allowedUsers: AllowedUser[] = previewMembers.map((member, index) => ({
    id: `allowed-${String(index + 1).padStart(2, '0')}`,
    email: member.email,
    name: member.name,
    role: member.role,
    created_at: createdAt,
    updated_at: createdAt,
  }))

  const profileNotes: ProfileNote[] = []

  // 홈 도트 사무실: 미리보기 계정 넷을 앉히고 나머지는 빈자리로 둔다.
  const [memberA, memberB, memberC] = previewProfiles
  const officeLayout: OfficeLayout = {
    revision: 'preview-office-1',
    seats: [
      { seat_index: 2, profile_id: memberA.id, name: memberA.name, role: memberA.role, gender: 'female', style_seed: 20260927 },
      { seat_index: 3, profile_id: previewLeader.id, name: previewLeader.name, role: previewLeader.role, gender: 'male', style_seed: 1204 },
      { seat_index: 6, profile_id: memberB.id, name: memberB.name, role: memberB.role, gender: 'male', style_seed: 777 },
      { seat_index: 7, profile_id: memberC.id, name: memberC.name, role: memberC.role, gender: 'female', style_seed: 31337 },
    ],
  }

  // 자리 상태 예시: 파트원 B는 오늘부터 사흘 출장, 파트원 C는 실험실에 가 있다(자리에 도트 표지가 보인다).
  const today = businessDateKey(new Date())
  const inDays = (days: number) => {
    const date = new Date(`${today}T00:00:00.000Z`)
    date.setUTCDate(date.getUTCDate() + days)
    return date.toISOString().slice(0, 10)
  }
  const memberPresence: MemberPresence = {
    statuses: [
      { profile_id: memberC.id, name: memberC.name, status: 'lab', updated_at: new Date().toISOString() },
    ],
    leaves: [
      { id: 'preview-leave-trip', profile_id: memberB.id, name: memberB.name, kind: 'trip', starts_on: today, ends_on: inDays(2), note: '오송 공장 실사' },
    ],
  }

  const announcements: Announcement[] = [
    {
      id: 'announcement-01',
      title: '주간 운영 안내',
      body: '이번 주 우선 검토 대상과 마감 일정을 확인해 주세요.',
      is_pinned: true,
      pinned_at: '2026-07-03T08:00:00.000Z',
      created_by: previewLeader.id,
      created_at: '2026-07-03T08:00:00.000Z',
      updated_at: '2026-07-03T08:00:00.000Z',
    },
    {
      id: 'announcement-02',
      title: '검토 요청 작성 기준',
      body: '제목과 설명에 변경 범위와 확인이 필요한 내용을 함께 작성해 주세요.',
      is_pinned: false,
      pinned_at: null,
      created_by: previewLeader.id,
      created_at: '2026-07-02T08:00:00.000Z',
      updated_at: '2026-07-02T08:00:00.000Z',
    },
  ]

  const activityLogs: ActivityLog[] = [
    {
      id: 'activity-01',
      actor_id: 'member-01',
      target_user_id: previewLeader.id,
      entity_type: 'review_request',
      entity_id: 'review-01',
      action: 'created',
      summary: '파트원 A님이 파트너 API 전환 검토를 요청했습니다.',
      metadata: { due_date: '2026-07-05' },
      created_at: '2026-07-03T09:20:00.000Z',
    },
    {
      id: 'activity-02',
      actor_id: previewLeader.id,
      target_user_id: 'member-02',
      entity_type: 'review_feedback',
      entity_id: 'feedback-01',
      action: 'created',
      summary: '미리보기 파트장님이 정산 자동화 화면 문구 확인에 피드백을 남겼습니다.',
      metadata: { review_request_id: 'review-02' },
      created_at: '2026-07-03T10:10:00.000Z',
    },
    {
      id: 'activity-03',
      actor_id: previewLeader.id,
      target_user_id: 'member-01',
      entity_type: 'project_assignment',
      entity_id: 'project-assignment-1-1',
      action: 'assigned',
      summary: '미리보기 파트장님이 파트원 A님에게 파트너 API 전환을 배정했습니다.',
      metadata: { project_id: 'project-03' },
      created_at: '2026-07-02T11:00:00.000Z',
    },
  ]

  // 홈 사무실 기물 알림 미리보기. 파트원 A는 새 공지 1건·새로 배정된 프로젝트 1건이 보이고,
  // 적용 업무는 확인했지만 아직 남아 있다(처리할 일). 파트장은 공통변경을 확인한 상태다.
  const changeData = { changeApplications, changeActionItems, productChangeTasks }
  const memberAssignmentIds = projectAssignments
    .filter((assignment) => assignment.user_id === previewMember.id)
    .map((assignment) => assignment.id)
  const sectionReadMarks: SectionReadMark[] = [
    {
      user_id: previewMember.id,
      section: 'announcements',
      seen_keys: announcements.filter((announcement) => announcement.id !== 'announcement-01').map((announcement) => announcement.id),
      seen_at: createdAt,
    },
    {
      user_id: previewMember.id,
      section: 'projects',
      seen_keys: memberAssignmentIds.slice(1),
      seen_at: createdAt,
    },
    {
      user_id: previewMember.id,
      section: 'change-applications',
      seen_keys: selectMemberPendingTasks(changeData, previewMember.id).map(({ task }) => task.id),
      seen_at: createdAt,
    },
    {
      user_id: previewLeader.id,
      section: 'change-applications',
      seen_keys: selectLeaderChangeActions(changeData).map((application) => application.id),
      seen_at: createdAt,
    },
  ]

  return {
    announcements,
    changeApplications,
    changeActionItems,
    productChangeTasks,
    changeProductScope,
    changeAssigneeOptions,
    profiles: [previewLeader, ...previewProfiles].map((profile) => ({ ...profile, created_at: createdAt })),
    allowedUsers,
    products,
    dutyMajorCategories,
    duties,
    productAssignments,
    dutyAssignments,
    reviewRequests,
    reviewEvents,
    reviewReadReceipts: [],
    auditEvents: [],
    projects,
    projectAssignments,
    profileNotes,
    activityLogs,
    officeLayout,
    sectionReadMarks,
    // 미리보기 회의실은 비어 있는 채로 시작한다.
    officeMeeting: null,
    memberPresence,
  }
}
