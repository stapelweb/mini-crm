-- Права доступа. Закрыто на уровне базы: при обращении к Supabase напрямую,
-- в обход интерфейса, исполнитель всё равно не увидит и не изменит чужое.

alter table public.profiles     enable row level security;
alter table public.objects      enable row level security;
alter table public.tasks        enable row level security;
alter table public.task_history enable row level security;

-- Сам себе исполнитель этой задачи?
create or replace function public.is_my_task(p_task_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.tasks t
    where t.id = p_task_id and t.assignee_id = auth.uid()
  );
$$;

-- PROFILES: имена нужны обеим ролям (автор, исполнитель, кто менял статус).
create policy profiles_select on public.profiles
  for select to authenticated using (true);

-- OBJECTS
create policy objects_select on public.objects
  for select to authenticated
  using (
    public.is_manager()
    or exists (
      select 1 from public.tasks t
      where t.object_id = objects.id and t.assignee_id = auth.uid()
    )
  );

create policy objects_insert on public.objects
  for insert to authenticated
  with check (public.is_manager() and created_by = auth.uid());

create policy objects_update on public.objects
  for update to authenticated
  using (public.is_manager()) with check (public.is_manager());

create policy objects_delete on public.objects
  for delete to authenticated
  using (public.is_manager());

-- TASKS
create policy tasks_select on public.tasks
  for select to authenticated
  using (public.is_manager() or assignee_id = auth.uid());

create policy tasks_insert on public.tasks
  for insert to authenticated
  with check (public.is_manager() and author_id = auth.uid() and status = 'new');

-- Постановщик правит поля задачи. Смену статуса всё равно ловит триггер
-- tasks_guard_status: напрямую статус не поменять даже ему.
create policy tasks_update on public.tasks
  for update to authenticated
  using (public.is_manager()) with check (public.is_manager());

create policy tasks_delete on public.tasks
  for delete to authenticated
  using (public.is_manager());

-- TASK_HISTORY: только чтение. Политик на insert/update/delete нет вовсе,
-- и права отобраны явно — подделать или стереть историю через API нельзя.
create policy task_history_select on public.task_history
  for select to authenticated
  using (public.is_manager() or public.is_my_task(task_id));

revoke insert, update, delete on public.task_history from anon, authenticated;
revoke insert, update, delete on public.profiles     from anon, authenticated;

-- Анонимным не доступно ничего.
revoke all on public.objects      from anon;
revoke all on public.tasks        from anon;
revoke all on public.task_history from anon;
revoke all on public.profiles     from anon;

-- Функцию смены статуса вызывает только вошедший пользователь.
revoke all on function public.change_task_status(uuid, public.task_status, text) from anon, public;
grant execute on function public.change_task_status(uuid, public.task_status, text) to authenticated;
