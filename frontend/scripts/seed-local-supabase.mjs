import { execFileSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const frontendDirectory = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
);
const repositoryDirectory = resolve(frontendDirectory, '..');
let status;

try {
  status = execFileSync('supabase', ['status', '--output', 'env'], {
    cwd: repositoryDirectory,
    encoding: 'utf8',
  });
} catch {
  throw new Error(
    'Could not read local Supabase status. Check Docker access and start the local stack.',
  );
}

const values = new Map(
  status
    .split('\n')
    .map((line) => line.match(/^([A-Z_]+)="?([^"]*)"?$/))
    .filter(Boolean)
    .map(([, key, value]) => [key, value]),
);
const apiUrl = values.get('API_URL');
const anonKey = values.get('ANON_KEY');
const serviceRoleKey = values.get('SERVICE_ROLE_KEY');

if (!apiUrl || !anonKey || !serviceRoleKey) {
  throw new Error(
    'Local Supabase status is missing required local credentials.',
  );
}

const email = 'local-dev@example.test';
const password = 'local-dev-password';
const adminClient = createClient(apiUrl, serviceRoleKey, {
  auth: { persistSession: false },
});
const { data: userData, error: listError } =
  await adminClient.auth.admin.listUsers({ page: 1, perPage: 1000 });

if (listError) {
  throw new Error(`Could not list local Auth users: ${listError.message}`);
}

let user = userData.users.find(
  (candidate) => candidate.email?.toLowerCase() === email,
);

if (!user) {
  const { data, error } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: 'Local Demo' },
  });

  if (error) {
    throw new Error(`Could not create the local demo user: ${error.message}`);
  }
  user = data.user;
}

if (!user) {
  throw new Error('Could not find or create the local demo user.');
}

const { error: roleError } = await adminClient.from('user_roles').upsert({
  user_id: user.id,
  role: 'admin',
  must_change_password: false,
});

if (roleError) {
  throw new Error(
    `Could not assign the local demo admin role: ${roleError.message}`,
  );
}

const userClient = createClient(apiUrl, anonKey, {
  auth: { persistSession: false },
});
const { error: signInError } = await userClient.auth.signInWithPassword({
  email,
  password,
});

if (signInError) {
  throw new Error(
    `Could not sign in as ${email}. Reset the local database to recreate the demo account.`,
  );
}

const { data: membership, error: membershipError } = await userClient
  .from('family_memberships')
  .select('family_id')
  .limit(1)
  .maybeSingle();

if (membershipError) {
  throw new Error(
    `Could not check the demo family: ${membershipError.message}`,
  );
}

if (!membership) {
  const { error } = await userClient.rpc('create_family', {
    family_name: 'Demo Family',
  });

  if (error) {
    throw new Error(`Could not create the demo family: ${error.message}`);
  }
}

console.log(`Local demo account is ready: ${email}`);
