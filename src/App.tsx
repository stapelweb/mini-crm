import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Link, Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import type { Profile } from './lib/types'
import Login from './pages/Login'
import Objects from './pages/Objects'
import ObjectPage from './pages/ObjectPage'
import TaskPage from './pages/TaskPage'
import MyTasks from './pages/MyTasks'

type Ctx = { session: Session | null; profile: Profile | null }
const AuthCtx = createContext<Ctx>({ session: null, profile: null })
export const useAuth = () => useContext(AuthCtx)

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setReady(true)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session) {
      setProfile(null)
      return
    }
    supabase
      .from('profiles')
      .select('id, full_name, role')
      .eq('id', session.user.id)
      .single()
      .then(({ data }) => setProfile(data as Profile | null))
  }, [session])

  if (!ready) return <div className="wrap" style={{ paddingTop: 40 }}>Загрузка…</div>

  if (!session) {
    return (
      <Routes>
        <Route path="*" element={<Login />} />
      </Routes>
    )
  }

  return (
    <AuthCtx.Provider value={{ session, profile }}>
      <Shell>
        <Routes>
          <Route path="/" element={<Objects />} />
          <Route path="/objects/:id" element={<ObjectPage />} />
          <Route path="/tasks/:id" element={<TaskPage />} />
          <Route path="/my" element={<MyTasks />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Shell>
    </AuthCtx.Provider>
  )
}

function Shell({ children }: { children: ReactNode }) {
  const { profile } = useAuth()
  const navigate = useNavigate()

  async function signOut() {
    await supabase.auth.signOut()
    navigate('/')
  }

  return (
    <>
      <header className="top">
        <div className="wrap">
          <span className="brand">Объекты и задачи</span>
          <nav>
            <Link to="/">Объекты</Link>
            {profile?.role === 'worker' && <Link to="/my">Мои задачи</Link>}
            <span className="who">
              {profile?.full_name}
              {profile ? (profile.role === 'manager' ? ' · постановщик' : ' · исполнитель') : ''}
            </span>
            <button onClick={signOut}>Выйти</button>
          </nav>
        </div>
      </header>
      <div className="wrap">{children}</div>
    </>
  )
}
