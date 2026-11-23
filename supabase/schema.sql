-- =====================================================================
--  Молодёжка · Среды — база данных для Supabase
--  Как применить: Supabase → SQL Editor → New query → вставить весь файл → Run.
--  Файл можно запускать повторно: он ничего не удалит.
-- =====================================================================

-- ---------- Участники ----------
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  name        text not null default '',
  role        text not null default 'member' check (role in ('admin','leader','member')),
  approved    boolean not null default false,
  depts       text[] not null default '{}',
  created_at  timestamptz not null default now()
);

-- ---------- Встречи (среды и особые встречи) ----------
create table if not exists public.meetings (
  id          uuid primary key default gen_random_uuid(),
  date        date not null unique,
  prep        text not null default '',
  start       text not null default '',
  format      text not null default '',
  theme       text not null default '',
  passage     text not null default '',
  goal        text not null default '',
  coord_id    uuid references public.profiles(id) on delete set null,
  speaker     text not null default '',
  servants    text not null default '',
  w_sent      boolean not null default false,
  w_agreed    boolean not null default false,
  welcome     text not null default '',
  groups      text not null default '',
  org         text not null default '',
  slides      text not null default '',
  media       text not null default '',
  budget      text not null default '',
  status      text not null default 'Идея',
  notes       text not null default '',
  updated_at  timestamptz not null default now()
);

-- Регламент встречи: список пунктов [{t:"18:30", what:"Начало, открывает", who:[uuid…], note:"Тимур"}]
alter table public.meetings add column if not exists schedule jsonb not null default '[]'::jsonb;

-- ---------- Задачи ----------
create table if not exists public.tasks (
  id          uuid primary key default gen_random_uuid(),
  title       text not null check (length(trim(title)) > 0),
  dept        text not null default '',
  assignees   uuid[] not null default '{}',
  due         date,
  meeting_id  uuid references public.meetings(id) on delete set null,
  done        boolean not null default false,
  note        text not null default '',
  created_by  uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists tasks_assignees_idx on public.tasks using gin (assignees);

-- ---------- Идеи форматов ----------
create table if not exists public.ideas (
  id          uuid primary key default gen_random_uuid(),
  title       text not null check (length(trim(title)) > 0),
  descr       text not null default '',
  by_name     text not null default '',
  status      text not null default 'Идея',
  author      uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);

-- ---------- Проверки ролей ----------
create or replace function public.is_approved() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where id = auth.uid() and approved);
$$;
create or replace function public.is_editor() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where id = auth.uid() and approved and role in ('admin','leader'));
$$;
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where id = auth.uid() and approved and role = 'admin');
$$;

-- ---------- Новый пользователь → профиль. Первый вошедший становится админом ----------
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare first_user boolean;
begin
  select not exists (select 1 from public.profiles) into first_user;
  insert into public.profiles (id, name, role, approved)
  values (new.id,
          coalesce(nullif(trim(new.raw_user_meta_data->>'name'), ''), split_part(new.email, '@', 1)),
          case when first_user then 'admin' else 'member' end,
          first_user)
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Роль и подтверждение меняет только админ; свою роль поменять нельзя (чтобы не потерять доступ)
create or replace function public.guard_profile() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() or new.id = auth.uid() then
    new.role := old.role;
    new.approved := old.approved;
  end if;
  return new;
end $$;
drop trigger if exists guard_profile on public.profiles;
create trigger guard_profile before update on public.profiles
  for each row execute function public.guard_profile();

create or replace function public.touch() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists touch_meetings on public.meetings;
create trigger touch_meetings before update on public.meetings for each row execute function public.touch();
drop trigger if exists touch_tasks on public.tasks;
create trigger touch_tasks before update on public.tasks for each row execute function public.touch();

-- ---------- Доступ (Row Level Security) ----------
alter table public.profiles enable row level security;
alter table public.meetings enable row level security;
alter table public.tasks    enable row level security;
alter table public.ideas    enable row level security;

revoke all on public.profiles, public.meetings, public.tasks, public.ideas from anon;
grant select, insert, update, delete on public.profiles, public.meetings, public.tasks, public.ideas to authenticated;

-- Участники: видят подтверждённые; себя видит каждый
drop policy if exists p_sel on public.profiles;
create policy p_sel on public.profiles for select to authenticated using (id = auth.uid() or public.is_approved());
drop policy if exists p_upd on public.profiles;
create policy p_upd on public.profiles for update to authenticated
  using (id = auth.uid() or public.is_admin()) with check (id = auth.uid() or public.is_admin());
drop policy if exists p_del on public.profiles;
create policy p_del on public.profiles for delete to authenticated using (public.is_admin() and id <> auth.uid());

-- Встречи: читают все подтверждённые; меняют админ, лидеры и координатор этой встречи
drop policy if exists m_sel on public.meetings;
create policy m_sel on public.meetings for select to authenticated using (public.is_approved());
drop policy if exists m_ins on public.meetings;
create policy m_ins on public.meetings for insert to authenticated with check (public.is_editor());
drop policy if exists m_upd on public.meetings;
create policy m_upd on public.meetings for update to authenticated
  using (public.is_editor() or (public.is_approved() and coord_id = auth.uid()))
  with check (public.is_approved());
drop policy if exists m_del on public.meetings;
create policy m_del on public.meetings for delete to authenticated using (public.is_editor());

-- Задачи: создаёт любой подтверждённый; меняют лидеры, автор и отмеченные люди
drop policy if exists t_sel on public.tasks;
create policy t_sel on public.tasks for select to authenticated using (public.is_approved());
drop policy if exists t_ins on public.tasks;
create policy t_ins on public.tasks for insert to authenticated with check (public.is_approved() and created_by = auth.uid());
drop policy if exists t_upd on public.tasks;
create policy t_upd on public.tasks for update to authenticated
  using (public.is_approved() and (public.is_editor() or created_by = auth.uid() or auth.uid() = any(assignees)))
  with check (public.is_approved());
drop policy if exists t_del on public.tasks;
create policy t_del on public.tasks for delete to authenticated using (public.is_editor() or created_by = auth.uid());

-- Идеи: предлагает любой подтверждённый; меняют лидеры и автор
drop policy if exists i_sel on public.ideas;
create policy i_sel on public.ideas for select to authenticated using (public.is_approved());
drop policy if exists i_ins on public.ideas;
create policy i_ins on public.ideas for insert to authenticated with check (public.is_approved() and author = auth.uid());
drop policy if exists i_upd on public.ideas;
create policy i_upd on public.ideas for update to authenticated using (public.is_editor() or author = auth.uid());
drop policy if exists i_del on public.ideas;
create policy i_del on public.ideas for delete to authenticated using (public.is_editor() or author = auth.uid());

-- ---------- Живое обновление у всех открытых телефонов ----------
do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['profiles','meetings','tasks','ideas'] loop
      if not exists (select 1 from pg_publication_tables
                     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end $$;

-- ---------- Стартовые данные (планёрка 16.11.2026) ----------
insert into public.meetings (date, prep, start, format, status, notes) values
  ('2026-11-28', '17:30', '18:30', 'Особая встреча', 'В работе', 'Суббота вместо среды 25.11'),
  ('2026-12-02', '', '', '', 'Идея', ''),
  ('2026-12-09', '', '', '', 'Идея', ''),
  ('2026-12-16', '', '', '', 'Идея', ''),
  ('2026-12-23', '', '', '', 'Идея', 'Перед Рождеством: подумать о рождественской теме'),
  ('2026-12-30', '', '', '', 'Идея', 'Канун Нового года: уточнить, будет ли встреча'),
  ('2027-01-06', '', '', '', 'Идея', 'Канун православного Рождества: уточнить, будет ли встреча'),
  ('2027-01-13', '', '', '', 'Идея', ''),
  ('2027-01-20', '', '', '', 'Идея', ''),
  ('2027-01-27', '', '', '', 'Идея', '')
on conflict (date) do nothing;

-- Регламент субботы 28.11 (людей отметите в приложении)
update public.meetings set schedule = '[
  {"t":"17:30","what":"Приходим готовить зал","who":[],"note":""},
  {"t":"","what":"Дежурные","who":[],"note":""},
  {"t":"18:30","what":"Начало, открывает","who":[],"note":""},
  {"t":"18:35","what":"2 песни","who":[],"note":""},
  {"t":"19:45","what":"Молитва и слово","who":[],"note":"Тимур"},
  {"t":"20:30","what":"Общение / чай-пай","who":[],"note":""},
  {"t":"21:00","what":"Конец","who":[],"note":""}
]'::jsonb
where date = '2026-11-28' and schedule = '[]'::jsonb;

insert into public.tasks (title, dept, due, created_by)
select v.title, v.dept, v.due::date, null from (values
  ('Заполнить план сред на декабрь и январь', 'Программа сред', '2026-11-23'),
  ('Распределить координаторов по датам', 'Координация сред', null),
  ('Передать темы декабря прославлению и согласовать с Катариной', 'Прославление', null),
  ('Найти ответственного за слайды на будущее', 'Слайды', null),
  ('Молиться и думать о человеке на медиа', 'Медиа', null),
  ('Подвести итог пробного периода по финансам', 'Финансы', '2026-12-31'),
  ('Обсудить крупные проекты: Trace Conf, ТРЕК, МЛС', 'Крупные проекты', null),
  ('Собрать у ребят идеи новых форматов', 'Программа сред', null)
) as v(title, dept, due)
where not exists (select 1 from public.tasks);

insert into public.ideas (title, descr, by_name, status, author)
select v.t, v.d, 'Планёрка 16.11', 'Есть', null from (values
  ('Разбор Писания + общение за столами', 'Короткий вход, отрывок, вопросы для обсуждения по столам'),
  ('Тематическая', 'Слово, интервью или гость на тему'),
  ('Молитва и прославление', 'Вечер, где основное время — молитва и прославление'),
  ('Общение', 'Настолки, активности, игры')
) as v(t, d)
where not exists (select 1 from public.ideas);
-- =====================================================================
--  Список команды: кто есть в списке, получает доступ сразу после регистрации.
--  Дополнение к schema.sql. Можно запускать повторно.
-- =====================================================================
create table if not exists public.allowed_emails (
  email     text primary key check (email = lower(trim(email)) and position('@' in email) > 1),
  name      text not null default '',
  role      text not null default 'member' check (role in ('admin','leader','member')),
  added_at  timestamptz not null default now()
);
alter table public.allowed_emails enable row level security;
revoke all on public.allowed_emails from anon;
grant select, insert, update, delete on public.allowed_emails to authenticated;
drop policy if exists ae_admin on public.allowed_emails;
create policy ae_admin on public.allowed_emails for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Новый пользователь → профиль. Первый — админ; кто в списке команды — сразу с доступом и ролью из списка.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  first_user boolean;
  inv_name text; inv_role text; invited boolean;
begin
  select not exists (select 1 from public.profiles) into first_user;
  select a.name, a.role, true into inv_name, inv_role, invited
    from public.allowed_emails a where a.email = lower(new.email);
  invited := coalesce(invited, false);
  insert into public.profiles (id, name, role, approved)
  values (new.id,
          coalesce(nullif(trim(new.raw_user_meta_data->>'name'), ''), nullif(inv_name, ''), split_part(new.email, '@', 1)),
          case when first_user then 'admin' when invited then inv_role else 'member' end,
          first_user or invited)
  on conflict (id) do nothing;
  return new;
end $$;
