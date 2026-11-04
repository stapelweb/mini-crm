-- Мини-CRM «Объекты и задачи» — схема, роли, данные.
-- Всё, что касается прав и переходов статусов, живёт в базе (см. 0002, 0003).

create extension if not exists "pgcrypto";

-- Роли пользователей системы.
create type public.user_role as enum ('manager', 'worker');

-- Статусы задачи. Переходы между ними проверяются триггером в 0002.
create type public.task_status as enum ('new', 'in_progress', 'review', 'accepted', 'rework');

-- Профиль пользователя. Один к одному с auth.users.
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text not null default '',
  role        public.user_role not null default 'worker',
  created_at  timestamptz not null default now()
);

-- Объект = стройка.
create table public.objects (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(btrim(name)) > 0),
  address     text not null default '',
  created_by  uuid not null references public.profiles (id),
  created_at  timestamptz not null default now()
);

-- Задача по объекту.
create table public.tasks (
  id           uuid primary key default gen_random_uuid(),
  object_id    uuid not null references public.objects (id) on delete cascade,
  title        text not null check (length(btrim(title)) > 0),
  description  text not null default '',
  assignee_id  uuid references public.profiles (id),
  status       public.task_status not null default 'new',
  author_id    uuid not null references public.profiles (id),
  created_at   timestamptz not null default now()
);

create index tasks_object_id_idx   on public.tasks (object_id);
create index tasks_assignee_id_idx on public.tasks (assignee_id);

-- История смены статусов. Пишется только триггером, правке и удалению не подлежит.
create table public.task_history (
  id          bigint generated always as identity primary key,
  task_id     uuid not null references public.tasks (id) on delete cascade,
  changed_by  uuid not null references public.profiles (id),
  changed_at  timestamptz not null default now(),
  from_status public.task_status,
  to_status   public.task_status not null,
  comment     text
);

create index task_history_task_id_idx on public.task_history (task_id, changed_at);

-- Профиль заводится автоматически при создании пользователя в auth.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    coalesce((new.raw_user_meta_data ->> 'role')::public.user_role, 'worker')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
