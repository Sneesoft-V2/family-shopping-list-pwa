import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const frontendDirectory = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
);
const repositoryDirectory = resolve(frontendDirectory, '..');
const typeFile = resolve(frontendDirectory, 'src/lib/database.types.ts');
const types = execFileSync('supabase', ['gen', 'types', 'typescript'], {
  cwd: repositoryDirectory,
  encoding: 'utf8',
});

writeFileSync(typeFile, types);
execFileSync('prettier', ['--write', typeFile], {
  cwd: frontendDirectory,
  stdio: 'inherit',
});
