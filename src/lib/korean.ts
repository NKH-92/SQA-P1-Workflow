/**
 * 한국어 조사 선택 도우미. 이름·제목·라벨처럼 동적인 값 뒤에 '을/를'을 고정해 붙이면
 * "완료 메모을", "자사제품 A을"처럼 틀린 문장이 된다. 마지막 글자의 받침을 보고 고른다.
 *
 * 한글이 아닌 끝 글자는 읽는 소리 기준으로 판단한다(숫자 '1'은 '일', 영문 'L'은 '엘').
 */

const HANGUL_START = 0xac00
const HANGUL_END = 0xd7a3
const RIEUL_BATCHIM = 8

/** 영문 알파벳 이름 읽기에서 받침이 있는 글자와 그 받침이 ㄹ인지. */
const LATIN_BATCHIM: Record<string, 'rieul' | 'other'> = {
  l: 'rieul',
  m: 'other',
  n: 'other',
  r: 'rieul',
}

/** 숫자 읽기(일, 이, 삼, …)에서 받침 여부. 0 영, 1 일(ㄹ), 3 삼, 6 육, 7 칠(ㄹ), 8 팔(ㄹ), 10 십. */
const DIGIT_BATCHIM: Record<string, 'rieul' | 'other' | null> = {
  '0': 'other',
  '1': 'rieul',
  '2': null,
  '3': 'other',
  '4': null,
  '5': null,
  '6': 'other',
  '7': 'rieul',
  '8': 'rieul',
  '9': null,
}

/** 따옴표·괄호·공백처럼 발음에 영향이 없는 끝 문자를 건너뛴다. */
const TRAILING_IGNORED = /[\s'"’”」』)\]}>.,…·]+$/u

type Batchim = 'none' | 'rieul' | 'other'

export function finalSound(word: string): Batchim {
  const trimmed = word.replace(TRAILING_IGNORED, '')
  const last = trimmed.slice(-1)
  if (!last) return 'none'
  const code = last.charCodeAt(0)
  if (code >= HANGUL_START && code <= HANGUL_END) {
    const batchim = (code - HANGUL_START) % 28
    if (batchim === 0) return 'none'
    return batchim === RIEUL_BATCHIM ? 'rieul' : 'other'
  }
  if (/[0-9]/.test(last)) return DIGIT_BATCHIM[last] ?? 'none'
  return LATIN_BATCHIM[last.toLowerCase()] ?? 'none'
}

export type JosaPair = '을/를' | '은/는' | '이/가' | '과/와' | '으로/로' | '이에요/예요' | '이라/라'

/** 조사만 돌려준다. 예: josa('완료 메모', '을/를') → '를' */
export function josa(word: string, pair: JosaPair): string {
  const sound = finalSound(word)
  const [withBatchim, withoutBatchim] = pair.split('/')
  if (pair === '으로/로') return sound === 'other' ? withBatchim : withoutBatchim
  return sound === 'none' ? withoutBatchim : withBatchim
}

/** 값과 조사를 붙여 돌려준다. 예: withJosa('자사제품 A', '을/를') → '자사제품 A를' */
export function withJosa(word: string, pair: JosaPair): string {
  return `${word}${josa(word, pair)}`
}

/** 화면 문구 안에서 제목을 가리킬 때 쓰는 작은따옴표. */
export function quoted(value: string): string {
  return `‘${value}’`
}

/** 따옴표로 감싼 제목에 조사까지 붙인다. 예: quotedWithJosa('검토', '을/를') → '‘검토’를' */
export function quotedWithJosa(value: string, pair: JosaPair): string {
  return `${quoted(value)}${josa(value, pair)}`
}
