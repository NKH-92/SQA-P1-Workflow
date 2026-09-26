import { useId, type ReactNode } from 'react'
import { projectStatusLabels } from '../../../lib/format'
import type { ProjectStatus } from '../../../types'
import type { ProjectGroup } from '../project.selectors'

export type ProjectStatusGroup = {
  status: ProjectStatus
  projects: ProjectGroup[]
}

type ProjectBoardProps = {
  groups: ProjectStatusGroup[]
  renderCard: (group: ProjectGroup) => ReactNode
}

function ProjectStatusSection({ group, renderCard }: { group: ProjectStatusGroup; renderCard: ProjectBoardProps['renderCard'] }) {
  const headingId = useId()
  return (
    <section aria-labelledby={headingId} className="project-status-section" data-status={group.status}>
      <header>
        <h2 id={headingId}>{projectStatusLabels[group.status]}</h2>
        <span>{group.projects.length}개</span>
      </header>
      <div className="project-card-grid">
        {group.projects.map((item) => renderCard(item))}
      </div>
    </section>
  )
}

/** 상태별(진행 중 → 예정 → 완료)로 묶은 프로젝트 카드 보드. 카드마다 바로 처리할 수 있다. */
export function ProjectBoard({ groups, renderCard }: ProjectBoardProps) {
  return (
    <div className="project-status-board">
      {groups.map((group) => (
        <ProjectStatusSection group={group} key={group.status} renderCard={renderCard} />
      ))}
    </div>
  )
}
