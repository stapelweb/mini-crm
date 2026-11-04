import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { Obj, Task } from '../lib/types'
import { STATUS_LABEL } from '../lib/types'
import { useAuth } from '../App'

export default function MyTasks() {
  const { session } = useAuth()
  const [tasks, setTasks] = useState<Task[]>([])
  const [objects, setObjects] = useState<Record<string, string>>({})

  useEffect(() => {
    async function load() {
      const { data: t } = await supabase
        .from('tasks')
        .select('*')
        .eq('assignee_id', session!.user.id)
        .order('created_at')
      setTasks((t ?? []) as Task[])

      const { data: o } = await supabase.from('objects').select('id, name')
      const map: Record<string, string> = {}
      for (const row of (o ?? []) as Obj[]) map[row.id] = row.name
      setObjects(map)
    }
    load()
  }, [session])

  return (
    <>
      <h1>Мои задачи</h1>
      {tasks.length === 0 && <div className="card muted">Задач на вас сейчас нет.</div>}
      {tasks.map((t) => (
        <div className="card" key={t.id}>
          <div className="row between">
            <div>
              <Link to={`/tasks/${t.id}`}>{t.title}</Link>
              <div className="muted">{objects[t.object_id] ?? ''}</div>
            </div>
            <span className={`badge s-${t.status}`}>{STATUS_LABEL[t.status]}</span>
          </div>
        </div>
      ))}
    </>
  )
}
