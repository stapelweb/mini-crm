import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { Obj } from '../lib/types'
import { useAuth } from '../App'

export default function Objects() {
  const { profile, session } = useAuth()
  const isManager = profile?.role === 'manager'
  const [objects, setObjects] = useState<Obj[]>([])
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [err, setErr] = useState('')
  const [adding, setAdding] = useState(false)

  async function load() {
    const { data } = await supabase.from('objects').select('id, name, address').order('name')
    setObjects((data ?? []) as Obj[])
    const { data: tasks } = await supabase.from('tasks').select('object_id')
    const c: Record<string, number> = {}
    for (const t of tasks ?? []) c[t.object_id] = (c[t.object_id] ?? 0) + 1
    setCounts(c)
  }

  useEffect(() => {
    load()
  }, [])

  async function add(e: React.FormEvent) {
    e.preventDefault()
    setErr('')
    const { error } = await supabase
      .from('objects')
      .insert({ name, address, created_by: session!.user.id })
    if (error) {
      setErr(error.message)
      return
    }
    setName('')
    setAddress('')
    setAdding(false)
    load()
  }

  return (
    <>
      <div className="row between">
        <h1>Объекты</h1>
        {isManager && (
          <button onClick={() => setAdding((v) => !v)}>
            {adding ? 'Отмена' : 'Добавить объект'}
          </button>
        )}
      </div>
      <p className="muted">
        {isManager
          ? 'Видны все стройки.'
          : 'Видны только стройки, где у вас есть задачи.'}
      </p>

      {adding && (
        <form className="card" onSubmit={add}>
          <label>
            <span>Название</span>
            <input value={name} onChange={(e) => setName(e.target.value)} required />
          </label>
          <label>
            <span>Адрес</span>
            <input value={address} onChange={(e) => setAddress(e.target.value)} />
          </label>
          {err && <div className="err">{err}</div>}
          <button className="primary">Сохранить</button>
        </form>
      )}

      {objects.length === 0 && <div className="card muted">Пока ничего нет.</div>}

      {objects.map((o) => (
        <div className="card" key={o.id}>
          <div className="row between">
            <div>
              <Link to={`/objects/${o.id}`}>
                <strong>{o.name}</strong>
              </Link>
              <div className="muted">{o.address || 'адрес не указан'}</div>
            </div>
            <span className="muted">задач: {counts[o.id] ?? 0}</span>
          </div>
        </div>
      ))}
    </>
  )
}
