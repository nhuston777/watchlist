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

## How search decides movie vs. show

- Hint words at the start or end of a query narrow it: `movie`/`film` → movies, `show`/`series`/`tv` → shows, a year (`dune 2021`) → that year (±1). Hints are ignored when the whole query is itself a title (`The Truman Show`, `1917`, `Blade Runner 2049`).
- It asks "The movie or the show?" when the top movie and top show are within 3× popularity of each other, or both match the title exactly and neither is 10× more popular. Otherwise the top result is previewed straight away.
- Titles already on a list are matched locally as you type (no network), and the server re-checks before every add; the `(mediaType, tmdbId)` unique constraint makes duplicates impossible.

## Daily refresh (Vercel Cron)

`vercel.json` schedules `GET /api/cron/refresh` daily at 10:00 UTC. Vercel sends `Authorization: Bearer $CRON_SECRET`; anything else gets a 401.

- Shows not marked Watched get fresh TMDB details (aired season count, next air date, status). When a **Caught up** show's season count passes the season it was caught up on, it's flagged **New season** and floats to the top of its list.
- Ratings older than 30 days (or never fetched) are refreshed from OMDb, oldest first, at most 200 a run (the free key allows 1,000/day).

Run it by hand (locally or against production):

```bash
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/refresh
```

It returns a JSON report: shows checked/updated, titles that just got a new season, ratings refreshed, and any errors. Vercel only runs crons on production deployments.

## Notion import (one-time)

`scripts/import-notion.ts` reads the three v1 Notion pages (Movie List, Movies for the Fam, TV Shows) and imports every linked title. It needs `NOTION_TOKEN`, `TMDB_KEY`, `DATABASE_URL` and `OMDB_KEY` (read from `.env`).

```bash
npm run import:notion -- --dry-run   # prints the report, writes nothing
npm run import:notion                # same report, then imports (~3 min)
```

- Each title's IMDb link is resolved through TMDB `/find`, and **TMDB's type wins** over the page it was on (e.g. *The Amateur* and *Restrepo* on the TV page are films).
- Headings map to list/status per the spec. "✅ Caught up" shows import as Caught up at their current season count, and each title keeps its Notion creation date as its added date.
- Same title twice with the same list/status → imported once. A conflicting duplicate → imported once, plus a `/review` entry to settle it.
- Loose plain-text notes are split on commas into `/review` entries with TMDB's best guess, and so are the two IMDb bookmarks on Movie List.
- **Idempotent**: re-running skips titles already in the database and review entries already created. Item counts after a real run match the dry-run report.

`/review` (linked from the header while anything is pending) lets you **Accept** each entry onto a list/status (moving the title if it already exists), **Pick a different match** with an inline search, or **Dismiss** it.

## Environment variables

See [`.env.example`](.env.example). To check everything end to end, work through [`docs/ops-checklist.md`](docs/ops-checklist.md).

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
