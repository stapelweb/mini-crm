import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { HistoryRow, Obj, Profile, Status, Task } from '../lib/types'
import { STATUS_LABEL, allowedTransitions } from '../lib/types'
import { useAuth } from '../App'

export default function TaskPage() {
  const { id } = useParams()
  const { profile, session } = useAuth()

  const [task, setTask] = useState<Task | null>(null)
  const [obj, setObj] = useState<Obj | null>(null)
  const [people, setPeople] = useState<Record<string, string>>({})
  const [history, setHistory] = useState<HistoryRow[]>([])
  const [comment, setComment] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [loaded, setLoaded] = useState(false)

  async function load() {
    const { data: t } = await supabase.from('tasks').select('*').eq('id', id).maybeSingle()
    setTask((t as Task) ?? null)
    setLoaded(true)
    if (!t) return

    const { data: o } = await supabase
      .from('objects')
      .select('id, name, address')
      .eq('id', (t as Task).object_id)
      .maybeSingle()
    setObj((o as Obj) ?? null)

    const { data: h } = await supabase
      .from('task_history')
      .select('*')
      .eq('task_id', id)
      .order('changed_at')
    setHistory((h ?? []) as HistoryRow[])

    const { data: p } = await supabase.from('profiles').select('id, full_name, role')
    const map: Record<string, string> = {}
    for (const row of (p ?? []) as Profile[]) map[row.id] = row.full_name
    setPeople(map)
  }

  useEffect(() => {
    load()
  }, [id])

  if (!loaded) return <div className="card muted">Загрузка…</div>
  if (!task) return <div className="card muted">Задача не найдена или недоступна.</div>

  const isManager = profile?.role === 'manager'
  const isAssignee = !!session && task.assignee_id === session.user.id
  const moves = allowedTransitions(task.status, isManager, isAssignee)

  async function move(to: Status) {
    setErr('')
    if (to === 'rework' && !comment.trim()) {
      setErr('Чтобы вернуть на доработку, напишите, что не так.')
      return
    }
    setBusy(true)
    const { error } = await supabase.rpc('change_task_status', {
      p_task_id: task!.id,
      p_to: to,
      p_comment: comment.trim() || null,
    })
    setBusy(false)
    if (error) {
      setErr(error.message)
      return
    }
    setComment('')
    load()
  }

  return (
    <>
      <p className="muted">
        <Link to={obj ? `/objects/${obj.id}` : '/'}>← {obj ? obj.name : 'Назад'}</Link>
      </p>

      <div className="card">
        <div className="row between">
          <h1>{task.title}</h1>
          <span className={`badge s-${task.status}`}>{STATUS_LABEL[task.status]}</span>
        </div>
        {task.description && <p>{task.description}</p>}
        <div className="muted">
          Объект: {obj?.name ?? '—'} · Исполнитель:{' '}
          {task.assignee_id ? people[task.assignee_id] ?? '—' : 'не назначен'} · Автор:{' '}
          {people[task.author_id] ?? '—'} · Создана:{' '}
          {new Date(task.created_at).toLocaleString('ru-RU')}
        </div>

        {moves.includes('rework') && (
          <label style={{ marginTop: 14 }}>
            <span>Комментарий (обязателен при возврате на доработку)</span>
            <textarea rows={2} value={comment} onChange={(e) => setComment(e.target.value)} />
          </label>
        )}

        {err && <div className="err">{err}</div>}

        <div className="actions">
          {moves.length === 0 && (
            <span className="muted">Сейчас доступных действий у вас нет.</span>
          )}
          {moves.map((m) => (
            <button
              key={m}
              className={m === 'rework' ? '' : 'primary'}
              disabled={busy}
              onClick={() => move(m)}
            >
              {m === 'in_progress' && task.status === 'rework' ? 'Вернуть в работу' : null}
              {m === 'in_progress' && task.status !== 'rework' ? 'Взять в работу' : null}
              {m === 'review' ? 'Отправить на проверку' : null}
              {m === 'accepted' ? 'Принять' : null}
              {m === 'rework' ? 'Вернуть на доработку' : null}
            </button>
          ))}
        </div>
      </div>

      <h2>История</h2>
      <div className="card">
        <table className="hist">
          <thead>
            <tr>
              <th>Когда</th>
              <th>Кто</th>
              <th>Что</th>
              <th>Комментарий</th>
            </tr>
          </thead>
          <tbody>
            {history.map((h) => (
              <tr key={h.id}>
                <td>{new Date(h.changed_at).toLocaleString('ru-RU')}</td>
                <td>{people[h.changed_by] ?? '—'}</td>
                <td>
                  {h.from_status ? `${STATUS_LABEL[h.from_status]} → ` : 'создана: '}
                  {STATUS_LABEL[h.to_status]}
                </td>
                <td>{h.comment ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
