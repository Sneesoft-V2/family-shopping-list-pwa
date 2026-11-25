# Family Shopping List frontend

The frontend is a German-language React application built with Vite and
TypeScript.

## Local development

The local Supabase stack uses Docker and is isolated from hosted projects.

```sh
npm install
npm run supabase:start
npm run supabase:env
npm run dev
```

The local-only demo account is `local-dev@example.test` /
`local-dev-password`. `supabase:env` writes the local API URL and anon key to
the ignored `.env.local`; it refuses to overwrite an existing file. Never use
the demo credentials outside local development or expose a service-role key in
browser code.

Use `npm run supabase:reset` to rebuild the local database from versioned
migrations and restore the demo family. This deletes data in the local database
only. Stop the services with `npm run supabase:stop`. Regenerate TypeScript
database types after schema changes with `npm run supabase:types`.

## Checks

```sh
npm run build
npm run lint
npm test
npm run format:check
```

Use `npm run test:watch` while developing tests and `npm run format` to format
the frontend.
