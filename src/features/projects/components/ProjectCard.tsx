import { Badge } from '../../../components/ui'
import type { Project, ProjectAssignment } from '../../../types'
import { formatDate, projectStatusLabels } from '../../../lib/format'
import { dueDateLabel } from '../../../lib/dates'

type ProjectCardProps = {
  project: Project
  assignments: ProjectAssignment[]
}

export function ProjectCard({ project, assignments }: ProjectCardProps) {
  const activeCount = assignments.length
  const deadlineMeta = project.deadline ? dueDateLabel(project.deadline) : '기한 없음'

  return (
    <article className="project-card">
      <div className="project-card-head">
        <Badge status={project.status}>{projectStatusLabels[project.status]}</Badge>
        <span>{project.deadline ? formatDate(project.deadline) : '기한 없음'}</span>
      </div>
      <h3>{project.name}</h3>
      <p>{project.description || '설명 없음'}</p>
      <p className="project-card-meta">
        {activeCount}명 배정 · {deadlineMeta}
      </p>
    </article>
  )
}
