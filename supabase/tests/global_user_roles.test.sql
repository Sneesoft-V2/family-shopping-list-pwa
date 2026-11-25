create extension if not exists pgtap with schema extensions;

begin;
select plan(13);

insert into auth.users (
  id,
  instance_id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
values
  (
    '11111111-1111-4111-8111-111111111111',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'role-admin@example.test',
    '',
    now(),
    '{}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  ),
  (
    '22222222-2222-4222-8222-222222222222',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'role-user@example.test',
    '',
    now(),
    '{}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  ),
  (
    '33333333-3333-4333-8333-333333333333',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'role-pending@example.test',
    '',
    now(),
    '{}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  ),
  (
    '44444444-4444-4444-8444-444444444444',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'role-pending-admin@example.test',
    '',
    now(),
    '{}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  );

insert into public.user_roles (user_id, role)
values
  ('11111111-1111-4111-8111-111111111111', 'admin'),
  ('22222222-2222-4222-8222-222222222222', 'user'),
  ('33333333-3333-4333-8333-333333333333', 'user'),
  ('44444444-4444-4444-8444-444444444444', 'admin');

update public.user_roles
set must_change_password = true
where user_id in (
  '33333333-3333-4333-8333-333333333333',
  '44444444-4444-4444-8444-444444444444'
);

insert into public.families (id, name, created_by)
values
  (
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'Assigned test family',
    '11111111-1111-4111-8111-111111111111'
  ),
  (
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    'Unassigned test family',
    '11111111-1111-4111-8111-111111111111'
  );

insert into public.family_memberships (family_id, user_id)
values (
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  '22222222-2222-4222-8222-222222222222'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '22222222-2222-4222-8222-222222222222',
  true
);

select is(
  (select count(*)::integer from public.user_roles where user_id = auth.uid()),
  1,
  'a user can read their own role'
);
select is(
  (
    select count(*)::integer
    from public.families
    where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  ),
  1,
  'a user can read an assigned family'
);
select is(
  (
    select count(*)::integer
    from public.families
    where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
  ),
  0,
  'a user cannot read an unassigned family'
);
select throws_ok(
  $$ select public.create_family('Unauthorized family') $$,
  'P0001',
  'App administrator access required',
  'a non-admin cannot create a family'
);
select throws_ok(
  $$ update public.user_roles set role = 'admin' where user_id = auth.uid() $$,
  '42501',
  'permission denied for table user_roles',
  'a user cannot change their own role'
);

select set_config(
  'request.jwt.claim.sub',
  '33333333-3333-4333-8333-333333333333',
  true
);
select is(
  (select count(*)::integer from public.families),
  0,
  'an invited user cannot access family data before setting a password'
);

select set_config(
  'request.jwt.claim.sub',
  '11111111-1111-4111-8111-111111111111',
  true
);
select ok((select public.is_app_admin()), 'the global admin role is recognized');
select ok(
  exists (
    select 1
    from public.families
    where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
  ),
  'an admin can read families without membership'
);
select lives_ok(
  $$ select public.create_family('Admin-created family') $$,
  'an admin can create a family'
);

reset role;

do $$
declare
  admin_to_demote uuid;
begin
  loop
    select user_id
    into admin_to_demote
    from public.user_roles
    where role = 'admin'
      and must_change_password = false
      and user_id <> '11111111-1111-4111-8111-111111111111'
    limit 1;
    exit when admin_to_demote is null;
    update public.user_roles
    set role = 'user'
    where user_id = admin_to_demote;
  end loop;
end;
$$;

select throws_ok(
  $$ delete from public.user_roles where user_id = '11111111-1111-4111-8111-111111111111' $$,
  '23514',
  'The last app admin cannot be removed or demoted',
  'the last admin cannot be deleted'
);
select throws_ok(
  $$ update public.user_roles set role = 'user' where user_id = '11111111-1111-4111-8111-111111111111' $$,
  '23514',
  'The last app admin cannot be removed or demoted',
  'the last admin cannot be demoted'
);
select lives_ok(
  $$ delete from public.user_roles where user_id = '44444444-4444-4444-8444-444444444444' $$,
  'a pending admin invite does not prevent deleting its role'
);

update public.families
set created_by = '22222222-2222-4222-8222-222222222222'
where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
delete from auth.users
where id = '22222222-2222-4222-8222-222222222222';
select is(
  (
    select count(*)::integer
    from public.families
    where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
      and created_by is null
  ),
  1,
  'deleting a user preserves their family and clears its creator reference'
);

select * from finish();
rollback;
