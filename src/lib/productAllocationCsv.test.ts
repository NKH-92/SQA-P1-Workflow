import { describe, expect, it } from 'vitest'
import type { AppData } from '../types'
import { createPreviewData } from '../demoData'
import { demoProductAllocationRows } from '../demo/anonymousProductAllocation'
import { buildProductAllocationCsvRows } from './productAllocationCsv'

describe('buildProductAllocationCsvRows', () => {
  it('exports products in the requested allocation format including unassigned rows', () => {
    const data = {
      announcements: [],
      profiles: [{ id: 'member-01', email: 'member@example.com', name: '담당자', role: 'member' }],
      allowedUsers: [],
      products: [
        {
          id: 'product-02',
          name: '위탁제품',
          category: '위탁',
          company_name: '위탁사',
          sort_order: 2,
        },
        {
          id: 'product-01',
          name: '자사제품',
          category: '자사',
          company_name: '자사',
          sort_order: 1,
        },
      ],
      duties: [],
      dutyMajorCategories: [],
      productAssignments: [
        {
          id: 'assignment-01',
          user_id: 'member-01',
          product_id: 'product-02',
          profiles: { name: '담당자', email: 'member@example.com' },
          products: { name: '위탁제품', category: '위탁', company_name: '위탁사', sort_order: 2 },
        },
      ],
      dutyAssignments: [],
      reviewRequests: [],
      projects: [],
      projectAssignments: [],
      profileNotes: [],
      activityLogs: [],
    } satisfies AppData

    expect(buildProductAllocationCsvRows(data)).toEqual([
      { 구분: '자사', 제품명: '자사제품', 담당자명: '', 위탁사명: '자사' },
      { 구분: '위탁', 제품명: '위탁제품', 담당자명: '담당자', 위탁사명: '위탁사' },
    ])
  })

  it('exports the demo preview allocation in the workbook column layout', () => {
    const rows = buildProductAllocationCsvRows(createPreviewData())

    expect(rows).toHaveLength(demoProductAllocationRows.length)
    expect(Object.keys(rows[0])).toEqual(['구분', '제품명', '담당자명', '위탁사명'])
    expect(rows[0]).toEqual({ 구분: '자사', 제품명: '자사제품 A', 담당자명: '파트원 A', 위탁사명: '자사' })
    expect(rows.filter((row) => !row.담당자명)).toHaveLength(
      demoProductAllocationRows.filter((row) => !row.assigneeName.trim()).length,
    )
  })
})
