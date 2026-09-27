import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { OfficeLayout } from '../../../types'
import { OfficePlace } from './OfficePlace'
import { PersonFace } from './PersonFace'
import { PixelUiProvider } from './PixelUiProvider'
import { PresenceIcon } from './PresenceIcon'

afterEach(cleanup)

const layout: OfficeLayout = {
  revision: 'r1',
  seats: [{ seat_index: 2, profile_id: 'member-01', name: '파트원 A', gender: 'female', style_seed: 20260927 }],
}

function renderWith(enabled: boolean) {
  const { container } = render(
    <PixelUiProvider enabled={enabled} layout={layout}>
      <p>
        <PersonFace fallback={<span data-testid="old-icon" />} name="파트원 A" profileId="member-01" />
        <PersonFace name="팀장님" profileId="team-1" />
        <PresenceIcon id="lab" />
        <OfficePlace people={[{ profileId: 'member-01', name: '파트원 A' }]} place="notice" />
      </p>
    </PixelUiProvider>,
  )
  return container
}

describe('pixel faces follow the chosen home style', () => {
  it('keeps the classic design when the person uses the classic home', () => {
    const container = renderWith(false)
    expect(screen.getByTestId('old-icon')).toBeInTheDocument()
    expect(container.querySelector('.person-face')).toBeNull()
    expect(container.querySelector('.office-place')).toBeNull()
    // 상태는 기존 화면에서도 선 아이콘으로 보인다.
    expect(container.querySelector('.presence-line-icon[data-kind="lab"]')).not.toBeNull()
  })

  it('shows the office character face, or a name plate for people without a seat, in the pixel design', () => {
    const container = renderWith(true)
    expect(screen.queryByTestId('old-icon')).not.toBeInTheDocument()
    const faces = container.querySelectorAll('.person-face')
    expect(faces).toHaveLength(2)
    expect(faces[0].querySelector('svg path')).not.toBeNull()
    expect(faces[1]).toHaveClass('person-face-plate')
    expect(faces[1]).toHaveTextContent('팀')
    for (const face of faces) expect(face).toHaveAttribute('aria-hidden', 'true')
    expect(container.querySelector('.pixel-icon')).not.toBeNull()
    expect(container.querySelector('.office-place[data-place="notice"]')).toHaveAttribute('aria-hidden', 'true')
  })
})
