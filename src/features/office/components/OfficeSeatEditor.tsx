import { useMemo, useRef, useState } from 'react'
import { Armchair, Dices } from 'lucide-react'
import { DialogActions, Modal } from '../../../components/ui'
import type { OfficeSeatInput } from '../../../data/validation/officeSeats'
import type { OfficeGender, OfficeLayout, Profile } from '../../../types'
import { createStyleSeed, OFFICE_GENDER_LABELS, OFFICE_GENDERS, resolveOfficeCharacter } from '../officeCharacter'
import {
  AISLE_ROW_SEATS,
  assignSeat,
  draftsFromLayout,
  rerollSeat,
  sameSeating,
  seatCandidates,
  seatsToSave,
  setSeatGender,
  WINDOW_ROW_SEATS,
  type SeatDraft,
} from '../officeLayoutModel'
import { OfficePortrait } from './OfficePortrait'

const EMPTY_SEAT_VALUE = ''

const ROWS = [
  { key: 'window', title: '창가 쪽 줄', hint: '얼굴이 보이는 자리예요', seats: WINDOW_ROW_SEATS },
  { key: 'aisle', title: '통로 쪽 줄', hint: '뒷모습과 모니터가 보이는 자리예요', seats: AISLE_ROW_SEATS },
] as const

export function OfficeSeatEditor({
  layout,
  profiles,
  onSave,
  onClose,
}: {
  layout: OfficeLayout | undefined
  profiles: readonly Profile[]
  /** 저장에 성공하면 true. 창은 부모가 닫는다. */
  onSave: (seats: OfficeSeatInput[], expectedRevision: string | null) => Promise<unknown>
  onClose: () => void
}) {
  const [initialDrafts] = useState(() => draftsFromLayout(layout, () => createStyleSeed()))
  // 연 순간의 revision으로 저장한다. 그사이 다른 곳에서 바꿨다면 서버가 충돌로 막는다.
  const [openedRevision] = useState(() => layout?.revision ?? null)
  const changedElsewhere = (layout?.revision ?? null) !== openedRevision
  const [drafts, setDrafts] = useState<SeatDraft[]>(initialDrafts)
  const [missingGender, setMissingGender] = useState<number[]>([])
  const [saving, setSaving] = useState(false)
  const firstInvalidRef = useRef<HTMLInputElement | null>(null)
  const candidates = useMemo(() => seatCandidates(profiles), [profiles])
  const nameById = useMemo(() => new Map(profiles.map((profile) => [profile.id, profile.name])), [profiles])
  const dirty = !sameSeating(initialDrafts, drafts)
  const occupiedCount = drafts.filter((draft) => draft.profileId).length

  const update = (next: SeatDraft[]) => {
    setDrafts(next)
    setMissingGender((current) => current.filter((seatIndex) => {
      const draft = next.find((item) => item.seatIndex === seatIndex)
      return Boolean(draft?.profileId && !draft.gender)
    }))
  }

  const save = async () => {
    if (saving) return
    const { seats, missingGender: missing } = seatsToSave(drafts)
    if (missing.length > 0) {
      setMissingGender(missing)
      window.setTimeout(() => firstInvalidRef.current?.focus(), 0)
      return
    }
    setSaving(true)
    try {
      await onSave(seats, openedRevision)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      className="office-editor"
      closeLabel="자리 배치 닫기"
      description="자리마다 앉을 사람과 캐릭터 성별을 골라요. 스타일과 개성은 무작위로 정해지고, 다시 뽑을 수 있어요."
      dirty={dirty}
      eyebrow="우리 파트 사무실"
      icon={<Armchair size={18} />}
      onClose={onClose}
      open
      title="사무실 자리 배치"
    >
      <div className="office-editor-body">
        {ROWS.map((row) => (
          <section aria-labelledby={`office-row-${row.key}`} className="office-editor-row" key={row.key}>
            <h3 id={`office-row-${row.key}`}>
              {row.title}
              <small>{row.hint}</small>
            </h3>
            <ul className="office-seat-list">
              {row.seats.map((seatIndex) => {
                const draft = drafts.find((item) => item.seatIndex === seatIndex)!
                const character = draft.profileId && draft.gender ? resolveOfficeCharacter(draft.gender, draft.styleSeed) : null
                const selectId = `office-seat-${seatIndex}`
                const errorId = `office-seat-${seatIndex}-error`
                const invalid = missingGender.includes(seatIndex)
                const isFirstInvalid = invalid && missingGender[0] === seatIndex
                return (
                  <li className="office-seat-row" data-empty={draft.profileId ? undefined : 'true'} key={seatIndex}>
                    <div className="office-seat-avatar">
                      {character ? <OfficePortrait look={character.look} /> : <Armchair aria-hidden="true" size={22} />}
                    </div>
                    <div className="office-seat-fields">
                      <label className="office-seat-label" htmlFor={selectId}>{seatIndex}번 자리</label>
                      <select
                        id={selectId}
                        onChange={(event) => update(assignSeat(drafts, seatIndex, event.target.value || null, createStyleSeed()))}
                        value={draft.profileId ?? EMPTY_SEAT_VALUE}
                      >
                        <option value={EMPTY_SEAT_VALUE}>빈자리</option>
                        {candidates.map((candidate) => {
                          const seatedAt = drafts.find((item) => item.profileId === candidate.id && item.seatIndex !== seatIndex)
                          return (
                            <option key={candidate.id} value={candidate.id}>
                              {seatedAt ? `${candidate.name} · 지금 ${seatedAt.seatIndex}번 자리` : candidate.name}
                            </option>
                          )
                        })}
                      </select>
                      {draft.profileId && (
                        <>
                          <div
                            aria-describedby={invalid ? errorId : undefined}
                            aria-invalid={invalid || undefined}
                            aria-label={`${seatIndex}번 자리 캐릭터 성별`}
                            className="office-gender"
                            role="radiogroup"
                          >
                            {OFFICE_GENDERS.map((gender: OfficeGender, index) => (
                              <label key={gender}>
                                <input
                                  checked={draft.gender === gender}
                                  name={`office-seat-${seatIndex}-gender`}
                                  onChange={() => update(setSeatGender(drafts, seatIndex, gender))}
                                  ref={isFirstInvalid && index === 0 ? firstInvalidRef : undefined}
                                  type="radio"
                                  value={gender}
                                />
                                <span>{OFFICE_GENDER_LABELS[gender]}</span>
                              </label>
                            ))}
                          </div>
                          <button
                            aria-label={`${nameById.get(draft.profileId) ?? `${seatIndex}번 자리`} 캐릭터 스타일 다시 뽑기`}
                            className="ghost compact office-reroll"
                            disabled={!draft.gender}
                            onClick={() => update(rerollSeat(drafts, seatIndex, createStyleSeed()))}
                            title={draft.gender ? undefined : '성별을 고르면 스타일을 다시 뽑을 수 있어요'}
                            type="button"
                          >
                            <Dices aria-hidden="true" size={15} />
                            다시 뽑기
                          </button>
                        </>
                      )}
                      {character && (
                        <p className="office-seat-personality">
                          <b>{character.personality.label}</b>
                          <span>{character.personality.description}</span>
                        </p>
                      )}
                      {draft.movedFrom && <p className="office-seat-note">{draft.movedFrom}번 자리에서 옮겨 왔어요.</p>}
                      {invalid && <p className="field-error" id={errorId}>캐릭터 성별을 골라 주세요.</p>}
                    </div>
                  </li>
                )
              })}
            </ul>
          </section>
        ))}
      </div>
      <DialogActions
        hint={changedElsewhere
          ? '다른 곳에서 자리 배치가 바뀌었어요. 닫고 다시 열면 최신 배치로 시작해요.'
          : !dirty
            ? '자리나 캐릭터를 바꾸면 저장할 수 있어요.'
            : occupiedCount === 0
              ? '저장하면 사무실이 비어요.'
              : `8자리 중 ${occupiedCount}자리에 앉아요.`}
        onClose={onClose}
      >
        <button aria-busy={saving || undefined} className="primary" disabled={saving || !dirty} onClick={() => void save()} type="button">
          {saving ? '저장하는 중…' : '저장하기'}
        </button>
      </DialogActions>
    </Modal>
  )
}
