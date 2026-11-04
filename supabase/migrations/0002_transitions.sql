-- Переходы статусов и история. Проверка живёт в базе, а не в интерфейсе:
-- прямой UPDATE статуса через API не пройдёт ни у кого, единственная дверь —
-- функция public.change_task_status().

-- Кто я: постановщик?
create or replace function public.is_manager()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'manager'
  );
$$;

-- Разрешённые переходы: из какого статуса, в какой, кто имеет право.
create or replace function public.transition_allowed(
  p_from       public.task_status,
  p_to         public.task_status,
  p_is_manager boolean,
  p_is_assignee boolean
) returns boolean
language sql
immutable
as $$
  select case
    when p_from = 'new'         and p_to = 'in_progress' then p_is_assignee
    when p_from = 'in_progress' and p_to = 'review'      then p_is_assignee
    when p_from = 'review'      and p_to = 'accepted'    then p_is_manager
    when p_from = 'review'      and p_to = 'rework'      then p_is_manager
    when p_from = 'rework'      and p_to = 'in_progress' then p_is_assignee
    else false
  end;
$$;

-- Прямое изменение статуса таблицы запрещено: только через change_task_status,
-- которая выставляет на время транзакции app.status_change = on.
create or replace function public.guard_task_status()
returns trigger
language plpgsql
as $$
begin
  if new.status is distinct from old.status
     and coalesce(current_setting('app.status_change', true), 'off') <> 'on' then
    raise exception 'Статус задачи меняется только через change_task_status()'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger tasks_guard_status
  before update on public.tasks
  for each row execute function public.guard_task_status();

-- История пишется триггером, а не приложением: подделать нечего.
create or replace function public.write_task_history()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.task_history (task_id, changed_by, from_status, to_status, comment)
    values (new.id, new.author_id, null, new.status, null);
    return new;
  end if;

  if new.status is distinct from old.status then
    insert into public.task_history (task_id, changed_by, from_status, to_status, comment)
    values (
      new.id,
      auth.uid(),
      old.status,
      new.status,
      nullif(btrim(coalesce(current_setting('app.status_comment', true), '')), '')
    );
  end if;
  return new;
end;
$$;

create trigger tasks_write_history_insert
  after insert on public.tasks
  for each row execute function public.write_task_history();

create trigger tasks_write_history_update
  after update on public.tasks
  for each row execute function public.write_task_history();

-- Единственная дверь для смены статуса.
create or replace function public.change_task_status(
  p_task_id uuid,
  p_to      public.task_status,
  p_comment text default null
) returns public.tasks
language plpgsql
security definer
set search_path = public
as $$
declare
  v_task        public.tasks;
  v_is_manager  boolean := public.is_manager();
  v_is_assignee boolean;
  v_comment     text := nullif(btrim(coalesce(p_comment, '')), '');
begin
  if auth.uid() is null then
    raise exception 'Нужен вход в систему' using errcode = '42501';
  end if;

  select * into v_task from public.tasks where id = p_task_id for update;
  if not found then
    raise exception 'Задача не найдена' using errcode = 'P0002';
  end if;

  v_is_assignee := v_task.assignee_id is not null and v_task.assignee_id = auth.uid();

  -- Исполнитель не трогает даже чтение чужой задачи, не то что статус.
  if not v_is_manager and not v_is_assignee then
    raise exception 'Нет прав на эту задачу' using errcode = '42501';
  end if;

  if not public.transition_allowed(v_task.status, p_to, v_is_manager, v_is_assignee) then
    raise exception 'Переход % -> % для этой роли запрещён', v_task.status, p_to
      using errcode = '42501';
  end if;

  if v_task.status = 'review' and p_to = 'rework' and v_comment is null then
    raise exception 'При возврате на доработку комментарий обязателен'
      using errcode = '22023';
  end if;

  perform set_config('app.status_change', 'on', true);
  perform set_config('app.status_comment', coalesce(v_comment, ''), true);

  update public.tasks set status = p_to where id = p_task_id
  returning * into v_task;

  perform set_config('app.status_change', 'off', true);
  perform set_config('app.status_comment', '', true);

  return v_task;
end;
$$;
