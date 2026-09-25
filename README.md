# Watchlist

Movies and shows to watch, on three shared lists: **Me**, **Dot & Me** and **Fam**. Type a title, see at once whether it's already on a list, and if not add it with one tap. Every title shows a poster, synopsis and Rotten Tomatoes score.

v2 replaces the Notion-backed v1 (Netlify). The design is in [`docs/v2-spec.md`](docs/v2-spec.md).

## Stack

- Next.js 16 (App Router, Server Actions) + React 19 + TypeScript
- Prisma 6 + Postgres (Neon free tier), `prisma db push` (no migrations)
- Deployed on Vercel from this repo; every push to `main` deploys
- TMDB for search, posters and TV details; OMDb for Rotten Tomatoes / IMDb ratings
- Plain CSS with oklch tokens (`src/app/globals.css`), fonts via `next/font`
- Single-passcode auth: scrypt hash in `APP_PASSCODE_HASH`, HMAC-signed 90-day httpOnly cookie

## Environment variables

See [`.env.example`](.env.example).

| Var | Purpose |
|---|---|
| `DATABASE_URL` | Neon **pooled** connection string (host contains `-pooler`). Use the **direct** string when running `prisma db push`. |
| `SESSION_SECRET` | Signs the session cookie: `openssl rand -hex 32` |
| `APP_PASSCODE_HASH` | scrypt hash of the passcode: `npm run hash-passcode` |
| `TMDB_KEY` | TMDB API key (v3) or read access token (v4) |
| `OMDB_KEY` | Personal OMDb key |
| `CRON_SECRET` | Authorizes the daily refresh cron: `openssl rand -hex 32` |
| `NOTION_TOKEN` | Only for the one-time import script; not needed in Vercel |

### Generating the passcode hash

```bash
npm run hash-passcode
```

It prompts for the passcode (input hidden) and prints a `salt:hash` line. Put that line in `APP_PASSCODE_HASH`. The passcode itself is never stored. Without npm installed, this one-liner does the same (note the passcode lands in your shell history):

```bash
node -e 'const c=require("crypto"),s=c.randomBytes(16).toString("hex");console.log(s+":"+c.scryptSync(process.argv[1].normalize(),s,64).toString("hex"))' 'your passcode'
```

## Local development

```bash
npm install
cp .env.example .env    # then fill it in
# create/update tables (DATABASE_URL pointed at Neon's direct, non-pooler host):
npx prisma db push
npm run dev
```

Open http://localhost:3000 and sign in with the passcode.

Checks before pushing:

```bash
npm run lint
npm run typecheck
npm run build
```

## Deploy (Vercel + Neon)

1. **Neon**: create a free project. Copy both connection strings (pooled and direct).
2. **Schema**: `DATABASE_URL="<direct string>" npx prisma db push`.
3. **Vercel**: import this GitHub repo. Add the env vars above for Production (pooled `DATABASE_URL`; everything except `NOTION_TOKEN`). Deploy.
4. Every push to `main` redeploys.

**Schema changes**: edit `prisma/schema.prisma`, then run `npx prisma db push` against the direct string **before** pushing code that depends on it. A push to `main` deploys immediately, so deploying first would break every page that touches the changed table until the database catches up.
