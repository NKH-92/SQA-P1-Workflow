import type {
  AllowedUser,
  AppData,
  Duty,
  DutyAssignment,
  DutyMajorCategory,
  Product,
  ProductAssignment,
  Profile,
  ProfileNote,
  Project,
  ProjectAssignment,
  ProjectStatus,
  ReviewRequest,
  ActivityLog,
} from './types'
import { p1ProductAllocationRows } from './data/p1ProductAllocation'
import {
  isP1DirectDutyAssignee,
  listP1DutyMajorCategories,
  p1DutyAllocationRows,
  resolveP1DutyAssigneeLabel,
} from './data/p1DutyAllocation'

const createdAt = '2026-07-02T00:00:00.000Z'

export const previewLeader: Profile = {
  id: 'demo-leader',
  email: 'preview-leader@example.com',
  name: '미리보기 파트장',
  role: 'leader',
}

const p1AssigneeNames = Array.from(
  new Set(p1ProductAllocationRows.map((row) => row.assigneeName.trim()).filter(Boolean)),
)

const previewMembers: Profile[] = p1AssigneeNames.map((name, index) => ({
  id: `member-${String(index + 1).padStart(2, '0')}`,
  email: `member-${String(index + 1).padStart(2, '0')}@example.com`,
  name,
  role: 'member',
}))

const extraPreviewProfiles: Profile[] = [
  {
    id: 'profile-leader-nkh',
    email: 'nkh@preview.local',
    name: '남광현',
    role: 'leader',
  },
  {
    id: 'member-extra-01',
    email: 'pjs@preview.local',
    name: '박지수',
    role: 'member',
  },
  {
    id: 'member-extra-02',
    email: 'jyj@preview.local',
    name: '정영주',
    role: 'member',
  },
  {
    id: 'member-extra-03',
    email: 'jsy@preview.local',
    name: '조소연',
    role: 'member',
  },
]

const previewProfiles = [...previewMembers, ...extraPreviewProfiles].filter(
  (profile, index, profiles) => profiles.findIndex((item) => item.name === profile.name) === index,
)

function previewProfileByName(name: string) {
  return previewProfiles.find((profile) => profile.name === name)
}

export const previewMember: Profile = previewMembers[0]

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

  const products: Product[] = p1ProductAllocationRows.map((row, index) => ({
    id: `product-${String(index + 1).padStart(3, '0')}`,
    name: row.productName,
    category: row.category,
    company_name: row.companyName,
    sort_order: index + 1,
    created_at: createdAt,
    updated_at: createdAt,
  }))

  const dutyMajorCategories: DutyMajorCategory[] = listP1DutyMajorCategories().map((name, index) => ({
    id: `duty-major-${String(index + 1).padStart(2, '0')}`,
    name,
    sort_order: index + 1,
    created_at: createdAt,
    updated_at: createdAt,
  }))

  const majorCategoryIdByName = Object.fromEntries(dutyMajorCategories.map((category) => [category.name, category.id]))

  const duties: Duty[] = p1DutyAllocationRows.map((row, index) => {
    const majorCategory = dutyMajorCategories.find((category) => category.name === row.majorCategory)
    return {
      id: `duty-${String(index + 1).padStart(2, '0')}`,
      name: row.dutyName,
      major_category_id: majorCategoryIdByName[row.majorCategory],
      sort_order: index + 1,
      assignee_label: resolveP1DutyAssigneeLabel(row.assigneeName),
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

  const productAssignments: ProductAssignment[] = p1ProductAllocationRows.flatMap((row, index) => {
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

  const dutyAssignments: DutyAssignment[] = p1DutyAllocationRows.flatMap((row, index) => {
    if (!isP1DirectDutyAssignee(row.assigneeName)) return []
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
      requester_id: 'member-03',
      title: '파트너 API 전환 검토',
      description: '전환 일정과 영향 범위 검토가 필요합니다.',
      attachment_url: 'https://example.com/reviews/partner-api',
      due_date: '2026-07-05',
      status: 'pending',
      created_at: '2026-07-03T09:20:00.000Z',
      updated_at: '2026-07-03T09:20:00.000Z',
      profiles: { name: '박도윤', email: 'doyun.park@example.com' },
      review_feedback: [],
    },
    {
      id: 'review-02',
      requester_id: 'member-02',
      title: '정산 자동화 화면 문구 확인',
      description: '파트너 안내 문구와 예외 케이스를 확인해 주세요.',
      attachment_url: null,
      due_date: null,
      status: 'pending',
      created_at: '2026-07-02T14:30:00.000Z',
      updated_at: '2026-07-03T10:10:00.000Z',
      profiles: { name: '이서연', email: 'seoyeon.lee@example.com' },
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
      requester_id: 'member-04',
      title: '모바일 알림 고도화 정책 검토',
      description: '마감 전 알림 조건과 발송 제외 조건 검토 요청입니다.',
      attachment_url: null,
      due_date: '2026-07-09',
      status: 'pending',
      created_at: '2026-07-01T16:45:00.000Z',
      updated_at: '2026-07-01T16:45:00.000Z',
      profiles: { name: '최하린', email: 'harin.choi@example.com' },
      review_feedback: [],
    },
  ]

  const allowedUsers: AllowedUser[] = previewMembers.map((member, index) => ({
    id: `allowed-${String(index + 1).padStart(2, '0')}`,
    email: member.email,
    name: member.name,
    role: member.role,
    created_at: createdAt,
  }))

  const profileNotes: ProfileNote[] = []

  const activityLogs: ActivityLog[] = [
    {
      id: 'activity-01',
      actor_id: 'member-03',
      target_user_id: previewLeader.id,
      entity_type: 'review_request',
      entity_id: 'review-01',
      action: 'created',
      summary: '박도윤님이 파트너 API 전환 검토를 요청했습니다.',
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
      summary: '미리보기 파트장님이 김민준님에게 파트너 API 전환을 배정했습니다.',
      metadata: { project_id: 'project-03' },
      created_at: '2026-07-02T11:00:00.000Z',
    },
  ]

  return {
    profiles: previewProfiles.map((profile) => ({ ...profile, created_at: createdAt })),
    allowedUsers,
    products,
    dutyMajorCategories,
    duties,
    productAssignments,
    dutyAssignments,
    reviewRequests,
    projects,
    projectAssignments,
    profileNotes,
    activityLogs,
  }
}
