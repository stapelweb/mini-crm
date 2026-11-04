import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { Obj, Profile, Task } from '../lib/types'
import { STATUS_LABEL } from '../lib/types'
import { useAuth } from '../App'

export default function ObjectPage() {
  const { id } = useParams()
  const { profile, session } = useAuth()
  const isManager = profile?.role === 'manager'

  const [obj, setObj] = useState<Obj | null>(null)
  const [tasks, setTasks] = useState<Task[]>([])
  const [people, setPeople] = useState<Profile[]>([])
  const [adding, setAdding] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [assignee, setAssignee] = useState('')
  const [err, setErr] = useState('')

  async function load() {
    const { data: o } = await supabase
      .from('objects')
      .select('id, name, address')
      .eq('id', id)
      .maybeSingle()
    setObj((o as Obj) ?? null)

    const { data: t } = await supabase
      .from('tasks')
      .select('*')
      .eq('object_id', id)
      .order('created_at')
    setTasks((t ?? []) as Task[])

    if (isManager) {
      const { data: p } = await supabase
        .from('profiles')
        .select('id, full_name, role')
        .eq('role', 'worker')
        .order('full_name')
      setPeople((p ?? []) as Profile[])
    }
  }

  useEffect(() => {
    load()
  }, [id, isManager])

  async function add(e: React.FormEvent) {
    e.preventDefault()
    setErr('')
    const { error } = await supabase.from('tasks').insert({
      object_id: id,
      title,
      description,
      assignee_id: assignee || null,
      status: 'new',
      author_id: session!.user.id,
    })
    if (error) {
      setErr(error.message)
      return
    }
    setTitle('')
    setDescription('')
    setAssignee('')
    setAdding(false)
    load()
  }

  if (!obj) return <div className="card muted">Объект не найден или недоступен.</div>

  return (
    <>
      <p className="muted">
        <Link to="/">← Все объекты</Link>
      </p>
      <div className="row between">
        <div>
          <h1>{obj.name}</h1>
          <div className="muted">{obj.address || 'адрес не указан'}</div>
        </div>
        {isManager && (
          <button onClick={() => setAdding((v) => !v)}>
            {adding ? 'Отмена' : 'Добавить задачу'}
          </button>
        )}
      </div>

      {adding && (
        <form className="card" onSubmit={add}>
          <label>
            <span>Название</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} required />
          </label>
          <label>
            <span>Описание</span>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>
          <label>
            <span>Исполнитель</span>
            <select value={assignee} onChange={(e) => setAssignee(e.target.value)}>
              <option value="">не назначен</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name}
                </option>
              ))}
            </select>
          </label>
          {err && <div className="err">{err}</div>}
          <button className="primary">Создать</button>
        </form>
      )}

      <h2>Задачи</h2>
      {tasks.length === 0 && <div className="card muted">Задач нет.</div>}
      {tasks.map((t) => (
        <div className="card" key={t.id}>
          <div className="row between">
            <Link to={`/tasks/${t.id}`}>{t.title}</Link>
            <span className={`badge s-${t.status}`}>{STATUS_LABEL[t.status]}</span>
          </div>
        </div>
      ))}
    </>
  )
}
