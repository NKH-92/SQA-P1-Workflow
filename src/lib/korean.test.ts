import { describe, expect, it } from 'vitest'
import { finalSound, josa, quotedWithJosa, withJosa } from './korean'

describe('korean particles', () => {
  it('picks 을/를 from the final Hangul syllable', () => {
    expect(withJosa('완료 메모', '을/를')).toBe('완료 메모를')
    expect(withJosa('해당 없음 사유', '을/를')).toBe('해당 없음 사유를')
    expect(withJosa('검토요청', '을/를')).toBe('검토요청을')
    expect(withJosa('공통변경', '은/는')).toBe('공통변경은')
    expect(withJosa('파트장', '이/가')).toBe('파트장이')
  })

  it('reads trailing Latin letters and digits by their spoken names', () => {
    expect(withJosa('자사제품 A', '을/를')).toBe('자사제품 A를')
    expect(withJosa('위탁제품 L', '을/를')).toBe('위탁제품 L을')
    expect(withJosa('CC-2026-014', '을/를')).toBe('CC-2026-014를')
    expect(withJosa('Rev.13', '을/를')).toBe('Rev.13을')
  })

  it('ignores closing quotes and brackets when finding the last sound', () => {
    expect(quotedWithJosa('파트너 API 전환 검토', '을/를')).toBe('‘파트너 API 전환 검토’를')
    expect(josa('정산 자동화(1차)', '을/를')).toBe('를')
    expect(finalSound('“원료 제조원 변경”')).toBe('other')
  })

  it('treats ㄹ as vowel-like for 으로/로', () => {
    expect(withJosa('메일', '으로/로')).toBe('메일로')
    expect(withJosa('담당자', '으로/로')).toBe('담당자로')
    expect(withJosa('검토요청', '으로/로')).toBe('검토요청으로')
  })

  it('handles 이에요/예요 and empty input', () => {
    expect(withJosa('비활성 상태', '이에요/예요')).toBe('비활성 상태예요')
    expect(withJosa('승인', '이에요/예요')).toBe('승인이에요')
    expect(josa('', '을/를')).toBe('를')
  })
})
