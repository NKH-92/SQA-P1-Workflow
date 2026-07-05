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

export const previewMember: Profile = previewMembers[0]
const dutyMajorCategorySeed: Array<{ id: string; name: string; sort_order: number; duties: string[] }> = [
  { id: 'duty-major-01', name: '기획', sort_order: 1, duties: ['요구사항 정리', '화면 정책 정의'] },
  { id: 'duty-major-02', name: '개발', sort_order: 2, duties: ['API 검토', '데이터 정합성 확인', '배포 검증'] },
  { id: 'duty-major-03', name: '운영', sort_order: 3, duties: ['운영 이슈 대응', '사용자 문의 분석', '권한 정책 점검', '성능 모니터링', '릴리스 노트 작성'] },
]
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

  const dutyMajorCategories: DutyMajorCategory[] = dutyMajorCategorySeed.map((category) => ({
    id: category.id,
    name: category.name,
    sort_order: category.sort_order,
    created_at: createdAt,
    updated_at: createdAt,
  }))

  const duties: Duty[] = dutyMajorCategorySeed.flatMap((category, categoryIndex) =>
    category.duties.map((name, dutyIndex) => ({
      id: `duty-${String(categoryIndex * 10 + dutyIndex + 1).padStart(2, '0')}`,
      name,
      major_category_id: category.id,
      sort_order: dutyIndex + 1,
      created_at: createdAt,
      updated_at: createdAt,
      duty_major_categories: { name: category.name, sort_order: category.sort_order },
    })),
  )

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
    const member = previewMembers.find((item) => item.name === row.assigneeName)
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

  const dutyAssignments: DutyAssignment[] = previewMembers.flatMap((member, memberIndex) =>
    pickUnique(duties, 2, random).map((duty, dutyIndex) => ({
      id: `duty-assignment-${memberIndex + 1}-${dutyIndex + 1}`,
      user_id: member.id,
      duty_id: duty.id,
      created_at: createdAt,
      profiles: { name: member.name, email: member.email },
      duties: {
        name: duty.name,
        major_category_id: duty.major_category_id,
        duty_major_categories: { name: duty.duty_major_categories?.name ?? '' },
      },
    })),
  )

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
    profiles: previewMembers.map((member) => ({ ...member, created_at: createdAt })),
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
