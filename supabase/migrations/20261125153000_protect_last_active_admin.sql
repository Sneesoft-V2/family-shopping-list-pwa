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
    if old.role <> 'admin'
      or old.must_change_password
      or (new.role = 'admin' and not new.must_change_password) then
      return new;
    end if;
  elsif tg_op = 'DELETE' then
    if old.role <> 'admin' or old.must_change_password then
      return old;
    end if;
  end if;

  perform pg_advisory_xact_lock(73511942);
  select count(*) into admin_count
  from public.user_roles
  where role = 'admin'
    and must_change_password = false;

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

drop trigger protect_last_app_admin on public.user_roles;
create trigger protect_last_app_admin
  before insert or update of role, must_change_password or delete
  on public.user_roles
  for each row execute function public.prevent_last_admin_loss();
