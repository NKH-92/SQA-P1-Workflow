import { afterEach, describe, expect, it } from 'vitest'
import {
  changeComposerDraftKey,
  clearChangeComposerDraft,
  readChangeComposerDraft,
  writeChangeComposerDraft,
  type ChangeComposerForm,
} from './composerDraft'

const form: ChangeComposerForm = {
  changeApplicationId: 'server-id-should-not-persist',
  expected_updated_at: '2026-07-01T00:00:00.000Z',
  change_number: '',
  source: 'official',
  title: '제목만 쓴 공통변경',
  summary: '',
  source_url: null,
  effective_date: '',
  action_kind: 'product_standard',
  custom_kind_name: null,
  action_content: '',
  due_date: '',
}

afterEach(() => window.localStorage.clear())

describe('change composer local draft', () => {
  it('keeps a new draft per person and never stores server identifiers', () => {
    const savedAt = writeChangeComposerDraft('leader-1', { form, selected: { 'product-1': null } }, new Date('2026-09-27T01:00:00.000Z'))
    expect(savedAt).not.toBeNull()

    const draft = readChangeComposerDraft('leader-1', Date.parse('2026-09-28T00:00:00.000Z'))
    expect(draft?.form.title).toBe('제목만 쓴 공통변경')
    expect(draft?.form.changeApplicationId).toBeNull()
    expect(draft?.form.expected_updated_at).toBeNull()
    expect(draft?.selected).toEqual({ 'product-1': null })
    expect(readChangeComposerDraft('leader-2')).toBeNull()
  })

  it('drops an expired or malformed draft', () => {
    writeChangeComposerDraft('leader-1', { form, selected: {} }, new Date('2026-09-01T00:00:00.000Z'))
    expect(readChangeComposerDraft('leader-1', Date.parse('2026-09-27T00:00:00.000Z'))).toBeNull()
    expect(window.localStorage.getItem(changeComposerDraftKey('leader-1'))).toBeNull()

    window.localStorage.setItem(changeComposerDraftKey('leader-1'), JSON.stringify({ form: { title: 1 } }))
    expect(readChangeComposerDraft('leader-1')).toBeNull()

    writeChangeComposerDraft('leader-1', { form, selected: {} })
    clearChangeComposerDraft('leader-1')
    expect(readChangeComposerDraft('leader-1')).toBeNull()
  })
})
