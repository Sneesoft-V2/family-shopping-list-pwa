# Family Shopping List PWA

A shared, installable shopping-list app for families. The application will be built as a Progressive Web App (PWA) for iOS, Windows, and macOS.

## Product language

All repository documentation is written in English. The user-facing application will be in German.

## Technology

- **Frontend:** React, TypeScript, and Vite; static assets hosted on GitHub Pages
- **API:** Node.js serverless functions hosted on Vercel
- **Database and authentication:** Supabase (PostgreSQL and Supabase Auth)
- **Planning:** Linear

## Planned repository layout

```text
frontend/   PWA source and static assets
api/        Vercel serverless functions
supabase/   Database migrations and tests
.github/    GitHub Actions and repository configuration
```

## Security

Never commit credentials, private keys, or production secrets. Keep server-side secrets in the appropriate hosting provider's environment settings. Only public client configuration may be included in the frontend build.

## Project planning

The project backlog is maintained in Linear.

## Local development

The local Supabase stack uses Docker and is isolated from the hosted staging
and production projects. Install Node.js LTS and Docker Desktop, then run:

```sh
cd frontend
npm install
npm run supabase:start
npm run supabase:env
npm run dev
```

`supabase:start` starts the local services and creates a demo account and family.
Sign in with `local-dev@example.test` and `local-dev-password`; these credentials
are for local development only. `supabase:env` writes the local API URL and
anon key to the ignored `frontend/.env.local`; it never writes the service-role
key. If that file already exists, the command refuses to overwrite it.

Use `npm run supabase:reset` to recreate the local database from all versioned
migrations and restore the demo account. This is destructive only to the local
database. Run `npm run supabase:stop` to stop the local services. Regenerate
frontend database types after schema changes with `npm run supabase:types`.
Never point local development at a hosted database. Never expose a secret or
service-role key in the browser.

Run the frontend checks from `frontend/`:

```sh
npm run build
npm run lint
npm test
npm run format:check
```

## Staging previews

Connect the repository to Vercel with `frontend/` as the Root Directory. Vercel
creates Preview deployments for pull requests; `frontend/vercel.json` skips
Vercel Production deployments because GitHub Pages is the production host. Set
`VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` for the Vercel Preview
environment to the staging project's URL and publishable/anon key.

Database changes are versioned in `supabase/migrations/` and must be applied
with the Supabase CLI, not manually through the SQL Editor. The project config
is in `supabase/config.toml`. Set the non-secret
`STAGING_SUPABASE_PROJECT_REF` and `PRODUCTION_SUPABASE_PROJECT_REF` repository
variables. If a separate hosted development project is used, also set the
optional `DEVELOPMENT_SUPABASE_PROJECT_REF` variable.

The `Apply staging database migrations` workflow is manually dispatched from
the branch being previewed. It refuses to run if the staging project ref
matches production or a configured development project. The `staging`
environment contains `SUPABASE_ACCESS_TOKEN` and `SUPABASE_DB_PASSWORD` secrets.
It is a shared database, so apply migrations one branch at a time.

## Production deployment

Pushes to `main` first apply versioned migrations to the production Supabase
project, then build and deploy the frontend to GitHub Pages. The `production`
environment needs `SUPABASE_ACCESS_TOKEN` and `SUPABASE_DB_PASSWORD` secrets;
the GitHub Pages production build reads `VITE_SUPABASE_URL` and
`VITE_SUPABASE_ANON_KEY` from the `github-pages` environment. Use only a
publishable/anon key in frontend configuration, never a service-role key.
Restrict both `production` and `github-pages` environments to `main`.

## Vercel API

Vercel serves Node.js functions from `api/` at the repository root. Configure
`CORS_ALLOWED_ORIGIN` in the Vercel project environment with the exact origin
of the deployed GitHub Pages site (scheme and host only, no path). The API
rejects other browser origins. Use `.env.example` as a reference; do not commit
real environment values.

Run the API tests with Node.js:

```sh
node --test api/health.test.js
```
