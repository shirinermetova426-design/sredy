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
