import { describe, expect, it } from 'vitest'
import { createPreviewData } from '../../demoData'
import {
  validateDutyCreate,
  validateInviteCreate,
  validateMajorCategoryCreate,
  validateProductCreate,
} from './master.validators'

describe('master.validators', () => {
  const data = createPreviewData()

  it('rejects invalid email on invite create', () => {
    expect(() => validateInviteCreate(data, { email: 'bad', name: '테스트', role: 'member' })).toThrow(
      '올바른 이메일 형식을 입력해 주세요.',
    )
  })

  it('rejects duplicate email on invite create', () => {
    expect(() =>
      validateInviteCreate(data, {
        email: data.allowedUsers[0].email,
        name: '테스트',
        role: 'member',
      }),
    ).toThrow('이미 초대 목록에 등록된 이메일입니다.')
  })

  it('rejects duplicate product name', () => {
    expect(() =>
      validateProductCreate(data, {
        name: data.products[0].name,
        category: '자사',
        companyName: '자사',
      }),
    ).toThrow('이미 등록된 제품명입니다.')
  })

  it('rejects duplicate duty in same major category', () => {
    const duty = data.duties[0]
    expect(() =>
      validateDutyCreate(data, {
        majorCategoryId: duty.major_category_id,
        name: duty.name,
      }),
    ).toThrow('같은 대분류에 이미 등록된 업무명입니다.')
  })

  it('rejects duty create without major category', () => {
    expect(() => validateDutyCreate(data, { majorCategoryId: '', name: '신규 업무' })).toThrow(
      '대분류를 선택해 주세요.',
    )
  })

  it('rejects empty invite name', () => {
    expect(() =>
      validateInviteCreate(data, { email: 'new@example.com', name: '   ', role: 'member' }),
    ).toThrow('이름을 입력해 주세요.')
  })

  it('rejects duplicate major category', () => {
    expect(() => validateMajorCategoryCreate(data, data.dutyMajorCategories[0].name)).toThrow(
      '이미 등록된 대분류입니다.',
    )
  })
})
