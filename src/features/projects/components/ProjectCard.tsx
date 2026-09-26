import { useId, type ReactNode } from 'react'
import { Link2, Trash2, Users } from 'lucide-react'
import { Badge, OverflowMenu, type OverflowMenuItem } from '../../../components/ui'
import { formatDate, projectStatusLabels } from '../../../lib/format'
import type { Profile, Project, ProjectAssignment, ProjectStatus } from '../../../types'
import { dueBadgeStatus, projectAssigneeNames, projectDueState } from '../project.selectors'
import { ProjectStatusMenu } from './ProjectStatusMenu'

const VISIBLE_ASSIGNEES = 3

type ProjectCardProps = {
  project: Project
  assignments: ProjectAssignment[]
  profiles: Pick<Profile, 'id' | 'name'>[]
  canManage: boolean
  highlighted?: boolean
  /** 링크 복사 결과처럼 이 카드에만 잠깐 보여줄 안내 */
  feedback?: ReactNode
  onEdit: () => void
  onAssign: () => void
  onChangeStatus: (status: ProjectStatus) => void
  onCopyLink: () => void
  onDelete: () => void
}

/**
 * 상태별 묶음 안의 프로젝트 카드. 카드 본문을 누르면(카드를 덮는 투명 버튼) 정보 수정 창이 열린다.
 * 상태 바꾸기·담당자 변경·더보기는 그 버튼과 형제 요소라 버튼 안에 버튼이 겹치지 않는다.
 * 담당 인원 수는 ‘몇 명이 맡았는지’만 보여주고 업무량·부하로 해석하지 않는다(DESIGN.md §2).
 */
export function ProjectCard({
  project,
  assignments,
  profiles,
  canManage,
  highlighted = false,
  feedback,
  onEdit,
  onAssign,
  onChangeStatus,
  onCopyLink,
  onDelete,
}: ProjectCardProps) {
  const titleId = useId()
  const due = projectDueState(project)
  const names = projectAssigneeNames(assignments, profiles)
  const shownNames = names.slice(0, VISIBLE_ASSIGNEES).join(', ')
  const hiddenCount = names.length - VISIBLE_ASSIGNEES
  const ownNote = !canManage ? assignments.find((assignment) => assignment.notes)?.notes : null
  const showDueChip = due.kind !== 'none' && due.kind !== 'done'

  const menuItems: OverflowMenuItem[] = [
    { label: '링크 복사', icon: <Link2 aria-hidden="true" size={15} />, onSelect: onCopyLink },
  ]
  if (canManage) {
    menuItems.push({ label: '삭제', icon: <Trash2 aria-hidden="true" size={15} />, danger: true, onSelect: onDelete })
  }

  return (
    <article
      aria-labelledby={titleId}
      className={highlighted ? 'project-card deeplink-target' : 'project-card'}
      data-due-tone={due.tone}
      data-project-id={project.id}
    >
      <div className="project-card-top">
        {canManage ? (
          <ProjectStatusMenu projectName={project.name} status={project.status} onChange={onChangeStatus} />
        ) : (
          <Badge status={project.status}>{projectStatusLabels[project.status]}</Badge>
        )}
        {showDueChip && <Badge status={dueBadgeStatus(due)}>{due.shortLabel}</Badge>}
        <OverflowMenu label={`${project.name} 더보기`} items={menuItems} />
      </div>
      {feedback}
      <h3 className="project-card-title" id={titleId}>
        {project.name}
      </h3>
      {canManage && (
        // 카드 전체를 덮는 투명 버튼(누르면 정보 수정). 다른 버튼들은 형제 요소로 그 위에 놓인다.
        <button aria-label={`${project.name} 수정`} className="project-card-open" onClick={onEdit} type="button" />
      )}
      {project.description && <p className="project-card-desc">{project.description}</p>}
      <p className="project-card-meta">
        {project.deadline ? (
          <>
            마감 <time dateTime={project.deadline}>{formatDate(project.deadline)}</time>
          </>
        ) : (
          '마감일 없음'
        )}
      </p>
      <div className="project-card-foot">
        <p className="project-card-assignees">
          <Users aria-hidden="true" size={14} />
          {names.length === 0 ? (
            <span className="project-card-unassigned">담당자 없음</span>
          ) : (
            <span>
              {shownNames}
              {hiddenCount > 0 && ` 외 ${hiddenCount}명`}
            </span>
          )}
        </p>
        {canManage && (
          <button
            aria-label={`${project.name} ${names.length === 0 ? '담당자 배정' : '담당자 변경'}`}
            className="ghost compact project-card-assign"
            onClick={onAssign}
            type="button"
          >
            {names.length === 0 ? '담당자 배정' : '담당자 변경'}
          </button>
        )}
      </div>
      {ownNote && <p className="project-card-note">메모 · {ownNote}</p>}
    </article>
  )
}
