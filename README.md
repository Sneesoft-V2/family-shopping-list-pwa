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

The React and Vite application lives in `frontend/`. Install Node.js LTS, then
run:

```sh
cd frontend
npm install
cp .env.example .env.local
npm run dev
```

Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in `.env.local` when
connecting the app to Supabase. Use the Supabase publishable key in the browser;
never expose a secret or service-role key. Local environment files are ignored
by Git.

Run the frontend checks from `frontend/`:

```sh
npm run build
npm run lint
npm test
npm run format:check
```

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
