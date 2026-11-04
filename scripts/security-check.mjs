// Проверка прав В ОБХОД ИНТЕРФЕЙСА: ходим прямо в Supabase тем же публичным
// ключом, что лежит в браузере, и смотрим, что исполнителю не дают лишнего.
//   node scripts/security-check.mjs
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
)

const URL_ = env.VITE_SUPABASE_URL
const KEY = env.VITE_SUPABASE_KEY

const USERS = {
  manager: ['manager@stapelweb.ru', 'Manager2026crm!'],
  worker1: ['worker1@stapelweb.ru', 'Worker1-2026crm!'],
  worker2: ['worker2@stapelweb.ru', 'Worker2-2026crm!'],
}

async function login(who) {
  const c = createClient(URL_, KEY, { auth: { persistSession: false } })
  const { error } = await c.auth.signInWithPassword({
    email: USERS[who][0],
    password: USERS[who][1],
  })
  if (error) throw new Error(`${who}: ${error.message}`)
  return c
}

let failed = 0
function check(name, ok, detail = '') {
  console.log(`${ok ? 'OK  ' : 'ПРОВАЛ'}  ${name}${detail ? '  — ' + detail : ''}`)
  if (!ok) failed++
}

const manager = await login('manager')
const w1 = await login('worker1')
const w2 = await login('worker2')

const { data: allTasks } = await manager.from('tasks').select('id, title, status, assignee_id')
const { data: allObjects } = await manager.from('objects').select('id, name')
check('постановщик видит задачи и объекты', allTasks.length > 0 && allObjects.length > 0,
  `задач ${allTasks.length}, объектов ${allObjects.length}`)

const { data: w1User0 } = await w1.auth.getUser()
const w1Id = w1User0.user.id
const { data: w1Tasks } = await w1.from('tasks').select('id, title, status, assignee_id')
const mineOnly = w1Tasks.every((t) => t.assignee_id === w1Id)
check(
  'исполнителю отдаются только его задачи',
  mineOnly && w1Tasks.length < allTasks.length,
  `видит ${w1Tasks.length} из ${allTasks.length}, все назначены на него: ${mineOnly}`,
)

const { data: w1Objects } = await w1.from('objects').select('id, name')
const hisObjectIds = new Set(w1Tasks.map((t) => t.object_id))
const { data: w1Tasks2 } = await w1.from('tasks').select('object_id')
for (const t of w1Tasks2) hisObjectIds.add(t.object_id)
check(
  'исполнителю отдаются только объекты с его задачами',
  w1Objects.length < allObjects.length && w1Objects.every((o) => hisObjectIds.has(o.id)),
  `видит ${w1Objects.length} из ${allObjects.length}`,
)

const foreign = allTasks.find((t) => t.assignee_id && !w1Tasks.some((x) => x.id === t.id))
const { data: peek } = await w1.from('tasks').select('*').eq('id', foreign.id)
check('чужая задача не читается по прямому запросу', peek.length === 0)

const { error: e1 } = await w1
  .from('tasks')
  .update({ status: 'accepted' })
  .eq('id', foreign.id)
  .select()
const { data: stillThere } = await manager
  .from('tasks')
  .select('status')
  .eq('id', foreign.id)
  .single()
check(
  'исполнитель не меняет чужую задачу напрямую',
  stillThere.status !== 'accepted',
  `статус остался «${stillThere.status}»`,
)

// Для проверок переходов постановщик заводит временную задачу и удаляет её в конце.
const { data: me } = await manager.auth.getUser()
const { data: w1User } = await w1.auth.getUser()
const { data: tmpRows, error: eTmp } = await manager
  .from('tasks')
  .insert({
    object_id: w1Objects[0].id,
    title: 'Временная задача проверки прав',
    description: 'Заводится и удаляется скриптом scripts/security-check.mjs',
    assignee_id: w1User.user.id,
    status: 'new',
    author_id: me.user.id,
  })
  .select()
if (eTmp) throw new Error('не удалось завести временную задачу: ' + eTmp.message)
const own = tmpRows[0]

await w1.from('tasks').update({ status: 'accepted' }).eq('id', own.id).select()
const { data: ownAfter } = await manager.from('tasks').select('status').eq('id', own.id).single()
check(
  'прямой UPDATE статуса не проходит и по своей задаче',
  ownAfter.status === 'new',
  `статус остался «${ownAfter.status}»`,
)

// У постановщика право на UPDATE есть — его ловит уже триггер в базе.
const { error: eMgr } = await manager
  .from('tasks')
  .update({ status: 'accepted' })
  .eq('id', own.id)
  .select()
check(
  'даже постановщику прямой UPDATE статуса запрещён триггером',
  !!eMgr,
  eMgr ? eMgr.message.slice(0, 70) : 'ошибки не было',
)

const { error: e3 } = await w1.rpc('change_task_status', {
  p_task_id: own.id,
  p_to: 'review',
  p_comment: null,
})
check('запрещённый переход «Новая → На проверке» отклонён', !!e3)

const { error: e4 } = await w1.rpc('change_task_status', {
  p_task_id: own.id,
  p_to: 'in_progress',
  p_comment: null,
})
check('разрешённый переход «Новая → В работе» прошёл', !e4, e4 ? e4.message : '')

const review = allTasks.find((t) => t.status === 'review')
const { error: e5 } = await manager.rpc('change_task_status', {
  p_task_id: review.id,
  p_to: 'rework',
  p_comment: '',
})
check('возврат на доработку без комментария отклонён', !!e5)

const { error: e6 } = await w1.from('task_history').insert({
  task_id: own.id,
  changed_by: (await w1.auth.getUser()).data.user.id,
  to_status: 'accepted',
})
check('запись в историю через API запрещена', !!e6)

const { data: hist } = await w1.from('task_history').select('id').eq('task_id', own.id)
const { error: e7 } = await w1.from('task_history').delete().eq('id', hist[0].id).select()
const { data: histAfter } = await w1.from('task_history').select('id').eq('task_id', own.id)
check('удалить историю через API нельзя', histAfter.length === hist.length)

const { data: foreignHist } = await w1.from('task_history').select('id').eq('task_id', foreign.id)
check('история чужой задачи не видна', foreignHist.length === 0)

const anon = createClient(URL_, KEY)
const anonResults = await Promise.all(
  ['tasks', 'objects', 'task_history', 'profiles'].map((t) => anon.from(t).select('id')),
)
check(
  'без входа ни одна таблица не отдаётся',
  anonResults.every((r) => r.error && !r.data),
  anonResults.map((r) => r.error?.code ?? 'ОТДАЛОСЬ').join(', '),
)

// убираем за собой: временная задача и её история
await manager.from('tasks').delete().eq('id', own.id)

void e1
void w2
console.log(failed === 0 ? '\nВсе проверки пройдены.' : `\nПровалено проверок: ${failed}`)
process.exit(failed === 0 ? 0 : 1)
