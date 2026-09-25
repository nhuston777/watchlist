# Watchlist 2.0 — Spec

Status: agreed design, not yet built. This is the handoff for building 2.0 with Claude Code.

## Goal

Replace the Notion-backed watchlist with a self-contained app. Everything (searching, adding, browsing, tracking) happens in the app; Notion is imported once and then retired.

The core loop, in order of importance:

1. Type a title. The app works out whether it's a movie or a show (asking only when it's genuinely ambiguous).
2. It immediately tells you if the title is **already on a list**, and where.
3. If not, it shows a poster, synopsis and Rotten Tomatoes score, and asks which list to add it to. One tap adds it.
4. Browse lists that show a poster, synopsis (with year / seasons) and RT score for every title.

## Decisions

| Topic | Decision |
|---|---|
| Stack | Same as `nhuston777/cfats`: Next.js 16 (App Router, Server Actions), React 19, TypeScript, Prisma 6 + Neon Postgres, Vercel. Plain CSS with oklch tokens (no Tailwind), `next/font`. |
| Repo | Rewrite in this repo on a v2 branch. The current Netlify site keeps running until cutover. |
| Lists | Three lists shared by movies and shows: **Me**, **Dot & Me**, **Fam**. Filter by Movies / Shows within a list. |
| Status | Movies: Want to watch → Watched. Shows: Want to watch → Watching → Caught up → Watched. Replaces Notion's "Watched" sections. |
| One list per title | A title lives on exactly one list. Adding a duplicate is blocked; the duplicate alert offers "move" instead. |
| Auth | Single passcode, no accounts. Signed 90-day cookie, same pattern as cfats `src/lib/auth.ts` minus the `User` table. |
| Ratings | Rotten Tomatoes Tomatometer via OMDb. If no RT score, fall back to IMDb rating, labeled "IMDb" so it's never mistaken for RT. |
| List layout | Rows (Notion-style cards) **and** poster grid, with a toggle that is remembered per device. |
| Ordering | Newest added first by default; sort menu: RT score, title, year. No drag-to-reorder. |
| TV progress | "Caught up" records the season count at that moment. When TMDB shows a newer season, the show is flagged **New season** and floats to the top of its list. |
| Duplicates | Alert shows list + status with quick actions: open, move to another list, and (if Watched) "Want to watch again". |
| Notion | One-time import, then Notion becomes a read-only archive. No sync back. |
| Loose Notion notes | Plain-text notes are split into titles, matched, and put in a **Needs review** queue. |

## Data sources

**TMDB** (primary; `TMDB_KEY` already exists on the Netlify site)
- Search: `GET /3/search/multi?query=` returns mixed results with `media_type` (`movie` | `tv` | `person`; drop `person`).
- Movie detail: `GET /3/movie/{id}?append_to_response=external_ids`, which gives `imdb_id`, `release_date`, `runtime`, `genres`, `overview`, `poster_path`.
- TV detail: `GET /3/tv/{id}?append_to_response=external_ids`, which gives `first_air_date`, `last_air_date`, `status` (Returning Series / Ended / Canceled), `number_of_seasons`, `number_of_episodes`, `next_episode_to_air`, `seasons[]`.
- Lookup by IMDb id (for the import): `GET /3/find/{imdb_id}?external_source=imdb_id`.
- Posters: `https://image.tmdb.org/t/p/w342{poster_path}` (w185 for thumbnails). Add `image.tmdb.org` to `images.remotePatterns` in `next.config.ts`.
- TMDB's terms require the attribution "This product uses the TMDB API but is not endorsed or certified by TMDB." Put it in the footer.

**OMDb** (ratings only)
- `GET https://www.omdbapi.com/?apikey=KEY&i={imdb_id}`: the `Ratings[]` entry with `Source: "Rotten Tomatoes"` gives e.g. `"93%"`, and `imdbRating` gives e.g. `"8.1"`.
- Get a personal free key (1,000 requests/day). The current code's `trilogy` fallback is a shared demo key and should not be used.
- RT is often missing for TV, which is why the IMDb fallback exists.

All third-party calls happen server-side (server actions / route handlers). Keys never reach the browser.

## Data model (Prisma)

```prisma
enum MediaType { MOVIE TV }
enum ListName  { ME DOT_AND_ME FAM }
enum Status    { WANT WATCHING CAUGHT_UP WATCHED }   // WATCHING and CAUGHT_UP are TV-only
enum ReviewState { PENDING ACCEPTED DISMISSED }

model Item {
  id              String    @id @default(cuid())
  mediaType       MediaType
  tmdbId          Int
  imdbId          String?
  title           String
  year            Int?                // release year / first-air year
  endYear         Int?                // TV: last-air year when Ended/Canceled
  overview        String?
  posterPath      String?
  runtimeMinutes  Int?                // movies
  genres          String[]
  tvStatus        String?             // "Returning Series" | "Ended" | "Canceled" ...
  seasonCount     Int?
  episodeCount    Int?
  nextAirDate     DateTime?
  rtScore         Int?                // 0–100, null if unknown
  imdbRating      Float?
  list            ListName
  status          Status    @default(WANT)
  caughtUpSeason  Int?                // seasonCount at the moment it was marked caught up
  note            String?
  addedAt         DateTime  @default(now())
  watchedAt       DateTime?
  metadataAt      DateTime  @default(now())   // last TMDB refresh
  ratingsAt       DateTime?                   // last OMDb refresh
  importedFrom    String?             // e.g. "notion:tv:Dot & Me"

  @@unique([mediaType, tmdbId])       // the duplicate guarantee
  @@index([list, status, addedAt])
}

model ReviewCandidate {
  id          String      @id @default(cuid())
  rawText     String                  // e.g. "Lone Survivor"
  source      String                  // e.g. "notion:movies:loose-note"
  suggestedList ListName?
  suggestedStatus Status?
  mediaType   MediaType?
  tmdbId      Int?                    // best guess; user confirms or re-searches
  reason      String                  // "loose note" | "duplicate in Notion" | "no TMDB match" ...
  state       ReviewState @default(PENDING)
  createdAt   DateTime    @default(now())
}
```

Derived, not stored: **New season** = `status == CAUGHT_UP && seasonCount > caughtUpSeason`.

## Screens

Mobile-first. One main screen plus a detail sheet, a review queue and a login page.

### `/`: search + lists (home)

- **Search bar pinned at the top**, focused on load. This is the primary action.
- Below it, the list browser:
  - List tabs: **Me · Dot & Me · Fam** (remember the last tab).
  - Chips: **All / Movies / Shows**.
  - Status segments: **Want to watch · Watching · Watched** (Watching covers Watching + Caught up; shows flagged New season appear first).
  - Sort menu (Newest, RT score, Title, Year) and a **rows/grid toggle**.
- **Row card**: poster thumbnail, title, a meta line, rating badge, 2–3 line synopsis (tap to expand), and a status control.
  - Movie meta line: `Movie · 2016 · 1h 56m`
  - Show meta line: `Show · 2019–2024 · 4 seasons · Ended`, or `Show · 2022– · 3 seasons · S4 airs Mar 12`
  - Badges: `🍅 93%` (RT), or `IMDb 8.1` when there's no RT score, or `—`. Also `New season` and `Caught up` pills.
- **Grid card**: poster with the rating badge overlaid and the title under it; tapping opens the detail sheet.

### Search flow (the core loop)

1. **Instant local check**: as you type, titles already in the database that match are shown first under **"Already on your lists"**, each with its list and status. No network call is needed, so the answer to "is this already on a list?" appears immediately.
2. **TMDB results** (debounced ~300 ms) appear under that: poster, title, year, and a Movie/Show badge. Any result already in the DB (matched on `mediaType + tmdbId`) shows an `On Dot & Me · Watched` badge instead of add actions.
3. **Type detection**:
   - Hints in the query override: "movie", "film" → movies only; "show", "series", "tv" → shows only; a year such as `dune 2021` narrows results.
   - If the top movie and top show both match the query title exactly (after normalization), or are within ~3× popularity of each other, show a small chooser: **"The movie (2016)" / "The show (2019–)"**.
   - Otherwise pre-select the top result.
4. **Preview card** for the selected result: large poster, title, meta line, full synopsis, and the RT score (fetched from OMDb now). For shows, the meta line includes seasons, years and status.
5. **Add**: three buttons, **Me / Dot & Me / Fam**, with the last one used highlighted. One tap adds the title as Want to watch and shows a toast with Undo.
6. **Duplicate alert**: if the selected title is already in the DB, the preview card is replaced by an alert: *"Already on **Dot & Me** · Watching (added Mar 3)"*, with the actions **Open**, **Move to…**, and, if Watched, **Want to watch again**. The server action enforces the same rule (unique constraint), so a race can't create a duplicate.

### Detail sheet (`/item/[id]`, opened as a sheet from the list)

Large poster, full synopsis, rating(s), and a season list for shows. Status controls, Move to list, Mark caught up (sets `caughtUpSeason = seasonCount`), a note field, a Refresh metadata button, and Remove (with confirmation).

### `/review`: Needs review

Import leftovers. Each row shows the raw text, the best TMDB guess (poster, title, year) and the suggested list/status. Actions: **Accept**, **Pick a different match** (inline search), **Dismiss**. A badge on the home header shows the count while it's non-zero.

### `/login`

Passcode field. `APP_PASSCODE_HASH` holds a scrypt hash (generated with a one-line script in the README); verify with `timingSafeEqual`. Set the signed session cookie as cfats does. The proxy/middleware redirects to `/login` everywhere except `/login` itself and the cron route.

## Background refresh

A Vercel Cron job runs daily and calls `/api/cron/refresh`, authorized with a `CRON_SECRET` bearer token:
- TV items not marked Watched: refresh TMDB details (season count, next air date, status). This is what makes the **New season** flag appear.
- Any item with `ratingsAt` older than 30 days: refresh OMDb ratings. Cap at ~200 per run to stay well under the 1,000/day limit.

## Notion import (one-time)

`scripts/import-notion.ts`, run locally with `NOTION_TOKEN`, `DATABASE_URL`, `TMDB_KEY` and `OMDB_KEY`. It has `--dry-run`, which prints a report and writes nothing. It is idempotent: re-running it skips items that already exist.

Pages (from `public/index.html` in v1):

| Page | Id |
|---|---|
| Movie List | `9599f1fb-5a4f-4dd4-b060-5a090e004a61` |
| Movies for the Fam | `098e01dc6edf442385758f06a252baab` |
| TV Shows | `881ebd59-d776-44a9-a563-02d6ff006e00` |

Section mapping (headings as they exist today):

| Page → section | List | Status |
|---|---|---|
| Movie List → (untitled top group) | Me | Want |
| Movie List → Want to Watch | Me | Want |
| Movie List → Have Watched | Me | Watched |
| Movies for the Fam → (untitled top group) | Fam | Want |
| Movies for the Fam → Have Watched | Fam | Watched |
| TV Shows → (untitled top group) | Me | Want |
| TV Shows → Me | Me | Want |
| TV Shows → Dot & Me | Dot & Me | Want |
| TV Shows → Fam | Fam | Want |
| TV Shows → Watched | Me | Watched *(see open question 1)* |

For TV entries, "✅ Caught up" (or a checked legacy `to_do`) → `CAUGHT_UP` with `caughtUpSeason` = current season count.

Parsing (reuse the logic in `netlify/functions/list-shows.js`):
- Entries come in two shapes: a `column_list` whose left column holds a bold linked title and the right column the poster, and a loose bold linked `paragraph` (e.g. *The Studio*, *This Is What Winning Looks Like*). Handle both.
- Pull the IMDb id from the link (`/tt\d+/`), then call TMDB `/find`. **Use the media type TMDB returns, not the page it was on.** Several entries on the TV page are really films, e.g. *The Amateur* (tt0899043) and *Restrepo* (tt1559549).
- Skip child-page links (the "Movies for the Fam" link on the Movie List page), bookmarks, buttons and empty blocks.
- Plain-text paragraphs that aren't linked titles are loose notes. Split them on commas and create one `ReviewCandidate` per piece, with a TMDB best guess and the page's default list/status. Known ones: "Dunkirk, 1917, Lone Survivor, Fury, king of Staten Island, old dads" and "Man of War" (Movie List), and "Don't think twice, Mike birbiglia shows, only murders, pop stars, hot rod, this much is true, extras, the boys" (TV Shows).

Duplicates already in Notion (seen so far: *The Boys* ×2, *MobLand* ×2, *Catch-22* ×2, *Peacemaker* in Me and Fam, *Jury Duty Presents* ×2, *Air* ×2, *Central Intelligence* ×2, *Booksmart* in Movie List and Fam):
- Same list/status twice → import once, silently.
- Different list or status → import the first occurrence and add a `ReviewCandidate` (reason "duplicate in Notion: also on X") so you choose which one to keep.

The dry-run report lists counts per list/status, every review candidate, and any IMDb ids TMDB couldn't resolve.

## Design direction

- Poster-forward and quiet, like Notion's cleanliness but darker: a warm near-black cinema theme by default, with a light theme when the system prefers it. Tokens in oklch on `:root`, as in cfats `globals.css`.
- One accent colour, used for primary actions and the New season flag. RT badge colours follow RT's own convention (≥60% red tomato, <60% green splat) as small inline marks, not the RT logo.
- Posters at 2:3 with rounded corners; skeleton shimmer while loading; a neutral placeholder tile with the title when there's no poster.
- Tap targets ≥ 44 px; the search bar and list tabs stay reachable one-handed on a phone.
- Add a web app manifest and icon so it can be added to the home screen and feel like an app.

## Environment variables

| Var | Purpose |
|---|---|
| `DATABASE_URL` | Neon pooled connection string (direct string for `prisma db push`) |
| `SESSION_SECRET` | Signs the session cookie (`openssl rand -hex 32`) |
| `APP_PASSCODE_HASH` | scrypt hash of the passcode |
| `TMDB_KEY` | TMDB API key (v3) or read access token (v4) |
| `OMDB_KEY` | Personal OMDb key |
| `CRON_SECRET` | Authorizes the daily refresh |
| `NOTION_TOKEN` | Import script only; not needed in Vercel |

## Build plan (milestones for Claude Code)

Note for the builder: cfats's `AGENTS.md` warns that Next.js 16 differs from older training data. Read `node_modules/next/dist/docs/` before writing code and heed deprecations (e.g. `middleware` → `proxy`).

1. **Scaffold**: remove the v1 files (`public/`, `netlify/`, `server.js`, `netlify.toml`) on the v2 branch; `create-next-app` with TS; Prisma + schema; passcode login; empty home page behind auth; README with setup and deploy steps.
2. **Search + add**: TMDB/OMDb clients in `src/lib/`; type detection; instant local "already on your lists" check; preview card; add-to-list buttons; duplicate alert with actions. This is the core loop, so get it right before lists.
3. **Lists**: tabs, type chips, status segments, sort, rows/grid toggle, detail sheet, status changes, move, remove.
4. **TV progress + refresh**: Caught up / New season logic, daily cron route, `vercel.json` cron entry.
5. **Import**: `scripts/import-notion.ts` with dry-run; `/review` queue.
6. **Cutover**: Neon project + Vercel project; set env vars; `prisma db push`; run the import (dry-run, then real); work through `/review`; point bookmarks/home-screen icon at the new URL; retire the Netlify site; mark the Notion pages "archived — see app".

Acceptance checks:
- Searching a title that's on any list, in any status, shows the "Already on…" alert before any add button is reachable.
- Adding the same TMDB title twice (e.g. double tap, two tabs) is impossible because the DB constraint holds.
- "arrival" goes straight to the movie; "the office" asks US-show vs UK-show via the results list; "dune" asks movie vs show; "dune movie" doesn't ask.
- Every list row shows a poster (or placeholder), synopsis, year/seasons line and a rating badge.
- After the import, item counts match the dry-run report and every loose note or conflict is in `/review`.

## Open questions (defaults assumed above; change before building if wrong)

1. **TV "Watched" section**: it isn't split by person in Notion. Default: import as **Me · Watched**. Alternative: put all of them in Review to assign.
2. **"Watching" vs "Want to watch" for imported TV**: Notion doesn't record whether you've started a show. Default: everything unflagged imports as Want to watch; flagged shows become Caught up.
3. **Removing a title** deletes it outright. An "Abandoned" status would keep a record of things you gave up on; not included by default.
