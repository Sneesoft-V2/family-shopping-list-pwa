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

Supabase Auth handles identity and sessions. App roles (`admin`, `maintainer`,
`user`) are stored separately in `public.user_roles`; users can read their own
role but cannot change it. RLS protects family data. Admin account-management
actions run through the Vercel API, which verifies the caller's Supabase
session and current database role before using its server-only service key.
The app does not offer public self-registration. Admins invite users by email;
the invitation link lets each user set a personal password before family data
is accessible. Maintainers and users currently have the same family-scoped
permissions. Deleting a user removes their role and family memberships but
preserves families they created, clearing only the creator reference.

After applying the global-role migration to a hosted project, follow the
[hosted setup guide](#hosted-setup-for-roles-and-invitations). Bootstrap the
first Admin once using a trusted operator session in the Supabase SQL Editor
(replace the example address with the invited Auth account):

```sql
insert into public.user_roles (user_id, role, must_change_password)
select id, 'admin', true
from auth.users
where lower(email) = lower('first-admin@example.com')
on conflict (user_id)
do update set role = 'admin', must_change_password = true;
```

The local Supabase seed creates `local-dev@example.test` as the local Admin.
Never use that demo account or its password in a hosted environment.

## Hosted setup for roles and invitations

Complete these steps once for each hosted Supabase project. For production, the
GitHub Pages URL for this repository is
`https://sneesoft-v2.github.io/family-shopping-list-pwa/`. If you use a custom
domain, replace it below with the deployed app URL.

1. **Configure GitHub deployment.** In the repository's Actions variables and
   secrets, set the production Supabase project reference and the
   `SUPABASE_ACCESS_TOKEN` and `SUPABASE_DB_PASSWORD` secrets used by the
   production migration workflow. In the `github-pages` environment, set
   `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (or publishable key), and
   `VITE_API_URL`. The API URL is the Vercel deployment origin.
2. **Configure Supabase Auth URLs.** In the production Supabase project (not
   staging), open **Authentication → URL Configuration**. Set **Site URL** to
   the full app URL, including the repository path and trailing slash. Add that
   same exact URL to **Redirect URLs** and save. For this repository, use
   `https://sneesoft-v2.github.io/family-shopping-list-pwa/`. GitHub Pages uses
   this subpath; omitting it sends invitation links to the wrong page. Avoid
   wildcards in the production allowlist. If you use a custom domain, enter its
   deployed app URL instead. This exact value will also be used later for
   `APP_SITE_URL`.
3. **Disable public registration.** Open
   **Authentication → Sign In / Providers** and turn off **Allow new users to
   sign up**. This prevents self-registration. Admin invitations continue to
   work because the app sends them through the server-side Supabase Admin API.
4. **Configure email delivery and the invite template.**
   - Choose an SMTP provider and verify a sender address/domain that you
     control. Follow the provider's instructions to publish its DNS
     authentication records (typically SPF and DKIM; DMARC is recommended).
   - In **Authentication → SMTP Settings**, enable custom SMTP and copy the
     provider's SMTP host, port, username, and SMTP password, plus the verified
     sender email and sender name. Use the provider's SMTP password, not a
     Supabase API key. Keep these credentials only in Supabase settings.
   - Save the settings. Supabase's default SMTP service is for testing only;
     it restricts recipient addresses and has a very low sending limit.
   - Open **Authentication → Email Templates → Invite user**. Keep the
     confirmation link using `{{ .ConfirmationURL }}`, for example:
     `<a href="{{ .ConfirmationURL }}">Accept invitation</a>`. The URL carries
     the verification token and the configured app redirect; do not replace it
     with the bare Site URL.
5. **Configure the Vercel API.** In the Vercel project that deploys the
   repository-root `api/` functions, set these values for Production:
   - `SUPABASE_URL`: the production Supabase project URL.
   - `SUPABASE_SECRET_KEY`: the new `sb_secret_...` key from Supabase
     Dashboard → **Project Settings → API Keys → Secret API keys**. The API
     sends new secret keys in the `apikey` header only, never as a Bearer JWT.
     Store it only as a server-side Vercel variable. Never use it in frontend
     variables or GitHub Actions. The API still accepts the old
     `SUPABASE_SERVICE_ROLE_KEY` variable as a migration fallback; when both
     are set, `SUPABASE_SECRET_KEY` takes precedence.
   - `CORS_ALLOWED_ORIGIN`: the app's origin only, with scheme and host but no
     path (for example `https://sneesoft-v2.github.io`).
   - `APP_SITE_URL`: the full app URL with its path (for example
     `https://sneesoft-v2.github.io/family-shopping-list-pwa/`).

   `APP_SITE_URL` must be on the same origin as `CORS_ALLOWED_ORIGIN`, but may
   include the app's path. Do not put a path in `CORS_ALLOWED_ORIGIN`. Store
   these values in Vercel's encrypted environment variables, not in the repo.

6. **Deploy the application and migrations.** Merge or push the changes to
   `main`. The production workflow applies the versioned Supabase migrations
   before building and deploying GitHub Pages. Confirm that both workflow jobs
   succeed before continuing.
7. **Create the initial Admin account.** In Supabase Dashboard, open
   **Authentication → Users** and invite the trusted initial Admin's email.
   Before the recipient opens the invite email, run the bootstrap SQL from the
   [Security section](#security) in **SQL Editor**, using that exact email.
   This assigns the Admin role and requires a password to be set on the first
   app visit. The invite link will then open the app's password setup screen.
8. **Verify the setup.** Complete the invite and set a strong personal
   password. Sign in as Admin, invite a separate test account with the User
   role and a family assignment, and verify that the invite email opens the
   application, requires password setup, and grants access only to the
   assigned family. Confirm that a non-admin cannot open Admin management and
   that the last active Admin cannot be demoted or deleted.

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
npm run supabase:test
npm run format:check
```

`supabase:test` runs the pgTAP role and RLS tests against the local Supabase
database; start the local stack first.

## Staging previews

Connect the repository to Vercel with `frontend/` as the Root Directory. Vercel
creates Preview deployments for pull requests; `frontend/vercel.json` skips
Vercel Production deployments because GitHub Pages is the production host. Set
`VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` for the Vercel Preview
environment to the staging project's URL and publishable/anon key.
Set `VITE_API_URL` in each frontend build environment to the matching Vercel API
origin.

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
`VITE_SUPABASE_ANON_KEY` and `VITE_API_URL` from the `github-pages` environment.
Use only a publishable/anon key in frontend configuration, never a service-role key.
Restrict both `production` and `github-pages` environments to `main`.

## Vercel API

Vercel serves Node.js functions from `api/` at the repository root. Configure
`CORS_ALLOWED_ORIGIN` in the Vercel project environment with the exact origin
of the deployed GitHub Pages site (scheme and host only, no path). The API
rejects other browser origins. Configure `SUPABASE_URL`,
`SUPABASE_SECRET_KEY`, `APP_SITE_URL`, and `CORS_ALLOWED_ORIGIN` in the
Vercel API project's encrypted environment settings. `APP_SITE_URL` must use
the same origin but can include the frontend's path so invite links return to
the deployed app's actual base URL.
Set `VITE_API_URL` in the frontend build environment to this API project's
origin. The secret key must never be exposed to GitHub build jobs or
frontend-prefixed variables. Existing `SUPABASE_SERVICE_ROLE_KEY` values remain
supported while migrating; the new `SUPABASE_SECRET_KEY` takes precedence.
Use `.env.example` as a reference; do not commit real environment values.

Run the API tests with Node.js:

```sh
node --test api/health.test.js tests/api/admin-users.test.js
```
