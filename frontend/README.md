# Family Shopping List frontend

The frontend is a German-language React application built with Vite and
TypeScript.

## Local development

```sh
npm install
cp .env.example .env.local
npm run dev
```

Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in `.env.local` when
connecting the app to Supabase. Use the publishable key in browser code; never
use a secret or service-role key. Local environment files are ignored by Git.

## Checks

```sh
npm run build
npm run lint
npm test
npm run format:check
```

Use `npm run test:watch` while developing tests and `npm run format` to format
the frontend.
