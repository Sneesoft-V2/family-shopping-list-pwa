import { execFileSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const frontendDirectory = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
);
const envPath = resolve(frontendDirectory, '.env.local');

if (existsSync(envPath)) {
  throw new Error(
    'frontend/.env.local already exists. Remove it before configuring local Supabase.',
  );
}

let status;
try {
  status = execFileSync('supabase', ['status', '--output', 'env'], {
    cwd: resolve(frontendDirectory, '..'),
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

if (!apiUrl || !anonKey) {
  throw new Error(
    'Local Supabase status did not include API_URL and ANON_KEY.',
  );
}

writeFileSync(
  envPath,
  `VITE_SUPABASE_URL=${apiUrl}\nVITE_SUPABASE_ANON_KEY=${anonKey}\n`,
  { flag: 'wx', mode: 0o600 },
);
console.log('Created frontend/.env.local with the local API URL and anon key.');
