create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.families (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 80),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.family_memberships (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('admin', 'maintainer', 'member')),
  created_at timestamptz not null default timezone('utc', now()),
  unique (family_id, user_id)
);

alter table public.profiles enable row level security;
alter table public.families enable row level security;
alter table public.family_memberships enable row level security;

create policy "Users can read their own profile"
  on public.profiles for select
  using ((select auth.uid()) = id);

create policy "Users can insert their own profile"
  on public.profiles for insert
  with check ((select auth.uid()) = id);

create policy "Users can update their own profile"
  on public.profiles for update
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

create policy "Members can read their families"
  on public.families for select
  using (
    exists (
      select 1
      from public.family_memberships
      where family_id = families.id
        and user_id = (select auth.uid())
    )
  );

create policy "Users can read their memberships"
  on public.family_memberships for select
  using (user_id = (select auth.uid()));

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

create or replace function public.create_family(family_name text)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  new_family_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;

  insert into public.families (name, created_by)
  values (btrim(family_name), (select auth.uid()))
  returning id into new_family_id;

  insert into public.family_memberships (family_id, user_id, role)
  values (new_family_id, (select auth.uid()), 'admin');

  return new_family_id;
end;
$$;

revoke all on function public.create_family(text) from public;
grant execute on function public.create_family(text) to authenticated;
