# Watchlist

v2 is being rebuilt from scratch. The design is in `docs/v2-spec.md`; build it milestone by milestone.

## Default stack (Nate's standard for new apps; same as nhuston777/cfats)

- Next.js (current major; App Router, Server Actions) + React + TypeScript
- Prisma + Postgres on Neon (free tier). `prisma db push`, no migration history. Pooled connection string for the app, direct string for schema changes.
- Hosted on Vercel, connected to a private GitHub repo under nhuston777; every push to `main` deploys.
- Plain CSS with oklch design tokens in `src/app/globals.css` (no Tailwind), fonts via `next/font`.
- Simple auth without a library: passcode hashed with scrypt, HMAC-signed httpOnly cookie (see cfats `src/lib/auth.ts`).
- Mobile-first. Secrets in env vars with a committed `.env.example`. README covers local setup and deploy.
- Update the database before pushing code that depends on a schema change.
- Next.js 16 differs from older docs: read `node_modules/next/dist/docs/` before writing code and heed deprecations.

## Cloud environment

Sessions for this repo must run in the **Watchlist** cloud environment. Its saved `DATABASE_URL`, `NOTION_TOKEN`, `OMDB_KEY`, and `TMDB_KEY` belong to this app specifically.

If a session finds itself in a different environment, it must stop and tell Nate before running anything that needs those keys or the database.
