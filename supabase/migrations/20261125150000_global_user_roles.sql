create table public.user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('admin', 'maintainer', 'user')),
  must_change_password boolean not null default false,
  created_at timestamptz not null default timezone('utc', now())
);

insert into public.user_roles (user_id, role)
select id, 'user'
from auth.users
on conflict (user_id) do nothing;

alter table public.family_memberships drop column role;

alter table public.user_roles enable row level security;
revoke all on public.user_roles from anon, authenticated;
grant select on public.user_roles to authenticated;
revoke insert, update, delete on public.family_memberships, public.families
  from anon, authenticated;

create policy "Users can read their own role and setup status"
  on public.user_roles for select
  to authenticated
  using (user_id = (select auth.uid()));

create or replace function public.can_access_app()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_roles
    where user_id = (select auth.uid())
      and must_change_password = false
  );
$$;

create or replace function public.is_app_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_roles
    where user_id = (select auth.uid())
      and role = 'admin'
      and must_change_password = false
  );
$$;

revoke all on function public.can_access_app() from public, anon;
revoke all on function public.is_app_admin() from public, anon;
grant execute on function public.can_access_app() to authenticated;
grant execute on function public.is_app_admin() to authenticated;

create or replace function public.prevent_last_admin_loss()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  admin_count integer;
begin
  if tg_op = 'INSERT' then
    if new.role = 'admin' then
      perform pg_advisory_xact_lock(73511942);
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if old.role <> 'admin' or new.role = 'admin' then
      return new;
    end if;
  elsif tg_op = 'DELETE' then
    if old.role <> 'admin' then
      return old;
    end if;
  end if;

  perform pg_advisory_xact_lock(73511942);
  select count(*) into admin_count
  from public.user_roles
  where role = 'admin';

  if admin_count <= 1 then
    raise exception using
      errcode = '23514',
      message = 'The last app admin cannot be removed or demoted';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function public.prevent_last_admin_loss() from public, anon, authenticated;

create trigger protect_last_app_admin
  before insert or update of role or delete on public.user_roles
  for each row execute function public.prevent_last_admin_loss();

drop policy if exists "Users can read their own profile" on public.profiles;
drop policy if exists "Users can insert their own profile" on public.profiles;
drop policy if exists "Users can update their own profile" on public.profiles;
drop policy if exists "Members can read their families" on public.families;
drop policy if exists "Users can read their memberships" on public.family_memberships;

create policy "Users can read their own profile"
  on public.profiles for select
  to authenticated
  using (id = (select auth.uid()) and (select public.can_access_app()));

create policy "Users can update their own profile"
  on public.profiles for update
  to authenticated
  using (id = (select auth.uid()) and (select public.can_access_app()))
  with check (id = (select auth.uid()) and (select public.can_access_app()));

create policy "Authorized users can read their families"
  on public.families for select
  to authenticated
  using (
    (select public.can_access_app())
    and (
      (select public.is_app_admin())
      or exists (
        select 1
        from public.family_memberships
        where family_id = families.id
          and user_id = (select auth.uid())
      )
    )
  );

create policy "Authorized users can read family memberships"
  on public.family_memberships for select
  to authenticated
  using (
    (select public.can_access_app())
    and (
      (select public.is_app_admin())
      or user_id = (select auth.uid())
    )
  );

create or replace function public.create_family(family_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_family_id uuid;
begin
  if not (select public.is_app_admin()) then
    raise exception 'App administrator access required';
  end if;

  insert into public.families (name, created_by)
  values (btrim(family_name), (select auth.uid()))
  returning id into new_family_id;

  insert into public.family_memberships (family_id, user_id)
  values (new_family_id, (select auth.uid()));

  return new_family_id;
end;
$$;

revoke all on function public.create_family(text) from public, anon;
grant execute on function public.create_family(text) to authenticated;
