import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createPreviewData, previewLeader } from '../demoData'
import { ProjectsPanel } from './ProjectsPanel'

afterEach(cleanup)

describe('ProjectsPanel', () => {
  it('offers the current leader as a project assignee even when the profile list omits self', async () => {
    const user = userEvent.setup()
    const data = createPreviewData()
    data.profiles = data.profiles.filter((profile) => profile.id !== previewLeader.id)
    expect(data.profiles.some((profile) => profile.id === previewLeader.id)).toBe(false)

    render(
      <ProjectsPanel
        profile={previewLeader}
        data={data}
        mutate={vi.fn()}
        setData={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('button', { name: '프로젝트' }))
    const dialog = screen.getByRole('dialog', { name: '무엇을 함께 만들까요?' })
    expect(within(dialog).getByText(`${previewLeader.name} (파트장 본인)`)).toBeInTheDocument()
  })
})
