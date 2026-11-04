-- Демонстрационные данные: один постановщик, два исполнителя,
-- три объекта и задачи во всех пяти статусах.
-- Пользователи заведены вручную в Supabase Auth (открытая регистрация выключена).

update public.profiles p set full_name = 'Иван Петров', role = 'manager'
  from auth.users u where u.id = p.id and u.email = 'manager@stapelweb.ru';
update public.profiles p set full_name = 'Сергей Орлов', role = 'worker'
  from auth.users u where u.id = p.id and u.email = 'worker1@stapelweb.ru';
update public.profiles p set full_name = 'Пётр Казаков', role = 'worker'
  from auth.users u where u.id = p.id and u.email = 'worker2@stapelweb.ru';

-- На время засева историю пишем руками: триггеры берут автора из auth.uid(),
-- а в SQL-редакторе сессии пользователя нет.
alter table public.tasks disable trigger tasks_write_history_insert;
alter table public.tasks disable trigger tasks_write_history_update;
alter table public.tasks disable trigger tasks_guard_status;

do $$
declare
  m uuid; w1 uuid; w2 uuid;
  o1 uuid; o2 uuid; o3 uuid;
  t uuid;
begin
  select id into m  from public.profiles where full_name = 'Иван Петров';
  select id into w1 from public.profiles where full_name = 'Сергей Орлов';
  select id into w2 from public.profiles where full_name = 'Пётр Казаков';

  insert into public.objects (name, address, created_by)
    values ('ЖК «Северный», корпус 2', 'Санкт-Петербург, Парашютная ул., 71', m)
    returning id into o1;
  insert into public.objects (name, address, created_by)
    values ('Склад на Софийской', 'Санкт-Петербург, Софийская ул., 90', m)
    returning id into o2;
  insert into public.objects (name, address, created_by)
    values ('Школа №412, кровля', 'Петергоф, Санкт-Петербургский пр., 4', m)
    returning id into o3;

  -- Новая
  insert into public.tasks (object_id, title, description, assignee_id, status, author_id)
    values (o1, 'Завезти арматуру на второй этаж',
            'Диаметр 12, 4 тонны. Разгрузка со стороны двора.', w1, 'new', m)
    returning id into t;
  insert into public.task_history (task_id, changed_by, from_status, to_status)
    values (t, m, null, 'new');

  -- В работе
  insert into public.tasks (object_id, title, description, assignee_id, status, author_id)
    values (o1, 'Залить стяжку в осях 3-7',
            'Толщина 60 мм, маяки выставлены.', w1, 'in_progress', m)
    returning id into t;
  insert into public.task_history (task_id, changed_by, from_status, to_status) values
    (t, m,  null,  'new'),
    (t, w1, 'new', 'in_progress');

  -- На проверке
  insert into public.tasks (object_id, title, description, assignee_id, status, author_id)
    values (o2, 'Заменить ворота секции Б',
            'Снять старые, поставить новые, проверить привод.', w2, 'review', m)
    returning id into t;
  insert into public.task_history (task_id, changed_by, from_status, to_status) values
    (t, m,  null,          'new'),
    (t, w2, 'new',         'in_progress'),
    (t, w2, 'in_progress', 'review');

  -- На доработке (с обязательным комментарием)
  insert into public.tasks (object_id, title, description, assignee_id, status, author_id)
    values (o2, 'Освещение склада: заменить светильники',
            '18 светильников, высота 6 м.', w2, 'rework', m)
    returning id into t;
  insert into public.task_history (task_id, changed_by, from_status, to_status, comment) values
    (t, m,  null,          'new',         null),
    (t, w2, 'new',         'in_progress', null),
    (t, w2, 'in_progress', 'review',      null),
    (t, m,  'review',      'rework',      'Два светильника не горят, и нет акта на утилизацию старых.');

  -- Принята
  insert into public.tasks (object_id, title, description, assignee_id, status, author_id)
    values (o3, 'Демонтаж старого покрытия кровли',
            'Вывоз мусора — отдельной заявкой.', w1, 'accepted', m)
    returning id into t;
  insert into public.task_history (task_id, changed_by, from_status, to_status) values
    (t, m,  null,          'new'),
    (t, w1, 'new',         'in_progress'),
    (t, w1, 'in_progress', 'review'),
    (t, m,  'review',      'accepted');

  -- Задача без исполнителя: постановщик ещё не назначил
  insert into public.tasks (object_id, title, description, assignee_id, status, author_id)
    values (o3, 'Смета на утеплитель', 'Посчитать по площади 980 м².', null, 'new', m)
    returning id into t;
  insert into public.task_history (task_id, changed_by, from_status, to_status)
    values (t, m, null, 'new');
end $$;

alter table public.tasks enable trigger tasks_write_history_insert;
alter table public.tasks enable trigger tasks_write_history_update;
alter table public.tasks enable trigger tasks_guard_status;
