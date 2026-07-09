import { FolderKanban } from 'lucide-react'
import { EmptyState } from '../../../components/ui'
import type { Project, ProjectAssignment, ProjectStatus } from '../../../types'
import { projectStatusLabels } from '../../../lib/format'
import { ProjectCard } from './ProjectCard'

export type ProjectStatusGroup = {
  status: ProjectStatus
  projects: Array<{ project: Project; assignments: ProjectAssignment[] }>
}

type ProjectBoardProps = {
  groups: ProjectStatusGroup[]
}

export function ProjectBoard({ groups }: ProjectBoardProps) {
  return (
    <div className="project-status-board">
      {groups.length === 0 && (
        <EmptyState
          icon={<FolderKanban size={22} />}
          title="조건에 맞는 프로젝트가 없습니다."
          description="검색어나 상태 필터를 바꿔 보세요."
        />
      )}
      {groups.map((group) => (
        <section className="project-status-section" key={group.status}>
          <header>
            <div>
              <span>{projectStatusLabels[group.status]}</span>
              <strong>{group.projects.length}개</strong>
            </div>
          </header>
          <div className="project-card-grid">
            {group.projects.map(({ project, assignments }) => (
              <ProjectCard assignments={assignments} key={project.id} project={project} />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
