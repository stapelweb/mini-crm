export type Role = 'manager' | 'worker'

export type Status = 'new' | 'in_progress' | 'review' | 'accepted' | 'rework'

export const STATUS_LABEL: Record<Status, string> = {
  new: 'Новая',
  in_progress: 'В работе',
  review: 'На проверке',
  accepted: 'Принята',
  rework: 'На доработке',
}

export type Profile = { id: string; full_name: string; role: Role }

export type Obj = { id: string; name: string; address: string }

export type Task = {
  id: string
  object_id: string
  title: string
  description: string
  assignee_id: string | null
  status: Status
  author_id: string
  created_at: string
}

export type HistoryRow = {
  id: number
  task_id: string
  changed_by: string
  changed_at: string
  from_status: Status | null
  to_status: Status
  comment: string | null
}

/**
 * Те же правила, что и в базе. Здесь они нужны только для того, чтобы
 * не показывать кнопку, которой всё равно не дадут сработать:
 * настоящая проверка живёт в функции change_task_status().
 */
export function allowedTransitions(
  status: Status,
  isManager: boolean,
  isAssignee: boolean,
): Status[] {
  const out: Status[] = []
  if (status === 'new' && isAssignee) out.push('in_progress')
  if (status === 'in_progress' && isAssignee) out.push('review')
  if (status === 'review' && isManager) out.push('accepted', 'rework')
  if (status === 'rework' && isAssignee) out.push('in_progress')
  return out
}
