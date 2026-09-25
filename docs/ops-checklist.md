# Watchlist 2.0 — ops checklist

One pass over everything built so far. Work top to bottom; each section assumes the one above passed. Tick boxes as you go (they're clickable in GitHub's editor).

## 0. Setup (once)

- [ ] `git checkout claude/watchlist-2-0-build-si3sho && npm install` finishes without errors.
- [ ] `.env` created from `.env.example` with:
  - `DATABASE_URL`: the Neon **pooled** string. The tables already exist in the `neondb` database; if you point at a different database, first run `DATABASE_URL="<direct string>" npx prisma db push`.
  - `SESSION_SECRET`: `openssl rand -hex 32`
  - `APP_PASSCODE_HASH`: `npm run hash-passcode`, type your passcode, and paste the `salt:hash` line it prints.
  - `TMDB_KEY`, `OMDB_KEY`: your keys.
  - `CRON_SECRET`: `openssl rand -hex 32`
- [ ] `npm run dev` starts, and http://localhost:3000 loads.
- [ ] To test on your phone: `npm run dev -- -H 0.0.0.0`, then open `http://<your computer's LAN IP>:3000` on the same Wi-Fi.

## 1. Sign-in (milestone 1)

- [ ] Opening `/` while signed out redirects to `/login`.
- [ ] A wrong passcode shows "Wrong passcode." and stays on the page.
- [ ] The right passcode lands on home. Reloading keeps you signed in.
- [ ] **Sign out** returns to `/login`, and `/` redirects there again.
- [ ] Opening `/item/anything` while signed out redirects to `/login`.
- [ ] Theme: dark by default. Switch your OS/phone to light mode and the app follows.
- [ ] Phone: Share → **Add to Home Screen** shows the gold "W" icon, and the app opens full screen.
- [ ] The footer shows the TMDB attribution line.

## 2. Search and add (milestone 2)

- [ ] The search box is focused on load. On a phone, the keyboard's return key says "Search".
- [ ] `arrival` previews **Arrival (2016)** straight away, with no movie/show question. The preview shows the poster, `Movie · 2016 · 1h 56m`, 🍅 94%, and the synopsis.
- [ ] `dune` shows **The movie (2021) / The show (2024–)** and no preview until you pick one. Each choice previews the right title.
- [ ] `dune movie` previews Dune (2021) without asking. `dune 2021` does the same.
- [ ] `the office` previews the US show (2005–2013 · 9 seasons · Ended), with the UK one (2001) next in Results.
- [ ] `the truman show`, `1917` and `blade runner 2049` each find the film (hint words inside a title aren't treated as hints).
- [ ] A show without an RT score shows **IMDb 8.x**, never a tomato.
- [ ] **Add**: tap **Me** on a preview. The toast "Added to Me · Undo" appears, and the card turns into "Already on **Me** · Want to watch (added today)".
- [ ] The button you used last is highlighted on the next preview, and still after a reload.
- [ ] **Undo** removes the title again, and the add buttons return.
- [ ] **Instant check**: type the first few letters of something you added. "Already on your lists" appears before TMDB results load.
- [ ] That title's TMDB result shows an "On Me · Want to watch" badge. Selecting it shows the alert, never add buttons.
- [ ] Alert → **Move to…** → another list: the alert updates, and the list browser shows it on the new list.
- [ ] Alert → **Open** opens its detail.
- [ ] Mark a title Watched (from its detail), then search it: the alert offers **Want to watch again**, and tapping it moves it back to Want to watch.
- [ ] **No duplicates**: open the same title's preview in two tabs and tap add in both. Only one copy exists, and the second tab shows the alert.
- [ ] Clearing the search (× or Esc) brings back the lists.

## 3. Lists and detail (milestone 3)

Add around 10 titles across the three lists first (mix movies and shows).

- [ ] **Tabs** Me / Dot & Me / Fam show only their own titles.
- [ ] **Chips** All / Movies / Shows filter. With Movies selected, the Watching segment disappears.
- [ ] **Segments** Want to watch / Watching / Watched show the right counts. Watching includes Caught up shows.
- [ ] **Sort**: Newest (default), RT score (RT high to low, then IMDb-only titles, then unrated), Title (ignores "The"), Year (newest first).
- [ ] The **rows/grid** toggle switches layout. The grid shows posters with the rating on top and titles underneath.
- [ ] Reload: tab, chip, segment, sort and layout are all remembered on this device.
- [ ] Row: tapping the synopsis expands it, and tapping again collapses it.
- [ ] Row status picker: movies offer Want / Watched, shows offer Want / Watching / Caught up / Watched. Changing it moves the row to the right segment.
- [ ] Every row has a poster (or a titled placeholder), meta line, synopsis and rating badge. Show rows read like `Show · 2022– · 3 seasons · S4 airs Mar 12` or `… · Ended`.
- [ ] Tapping a title or poster opens the **sheet** over the list, and the URL becomes `/item/…`.
- [ ] The sheet closes with ×, a backdrop tap, Esc, or the browser/phone back gesture, and the list is where you left it.
- [ ] Reloading while the sheet is open shows the same title as a full page with "← Watchlist".
- [ ] Sheet **status** buttons work. Marking a movie Watched shows "Watched <date>".
- [ ] Sheet **List** buttons move the title.
- [ ] Shows: the **Seasons** list loads (✓ on seasons you're caught up on; future seasons dimmed with "Airs <date>").
- [ ] **Note**: type, tap elsewhere, reload: the note is still there.
- [ ] **Refresh metadata** says "Updated from TMDB and OMDb."
- [ ] **Remove…** → **Remove** closes the sheet and the title is gone. Search it: it can be added again.

## 4. TV progress and daily refresh (milestone 4)

- [ ] Mark a show **Caught up**. Its row shows a "Caught up" pill, and the sheet says "Caught up through season N".
- [ ] Simulate an older caught-up state in Neon's SQL editor:
      `update "Item" set "caughtUpSeason" = "seasonCount" - 1 where title = '<a caught-up show>';`
      Reload the app:
  - [ ] The row shows a **New season** pill (accent colour) and sits at the top of Watching, whatever the sort.
  - [ ] That list's tab shows an accent dot.
  - [ ] The sheet shows **Mark caught up on season N**. Tapping it clears the flag.
- [ ] **Cron auth**: `curl -i http://localhost:3000/api/cron/refresh` returns 401, even when signed in (it needs the bearer token).
- [ ] **Cron run**: first set a caught-up show's stored season count back so the cron has something to find:
      `update "Item" set "seasonCount" = "caughtUpSeason" where title = '<a caught-up show>';`
      Then run `curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/refresh`.
  - [ ] The JSON lists that show under `newSeasons`, and `errors` is empty.
  - [ ] `tvChecked` equals the number of shows not marked Watched.
  - [ ] Reload the app: that show is flagged New season.
- [ ] **Ratings refresh**: `update "Item" set "ratingsAt" = now() - interval '40 days' where title = '<any>';`, then run the cron again. `ratingsUpdated` is at least 1, and that row's `ratingsAt` is today.

## 5. Notion import and review (milestone 5)

Do this against a **throwaway database** first: a Neon branch (Neon console → Branches → Create branch, then use its connection string), or local Postgres. The real import happens at cutover. Your `.env` needs `NOTION_TOKEN` too.

- [ ] `npm run import:notion -- --dry-run` finishes in about a minute and writes nothing (item count unchanged in Neon's Tables view). When I ran it against your pages, the report said:
  - 154 items to import. 7 same-list duplicates imported once. 5 titles filed on the other page type.
  - By list: Me · Want 84, Me · Caught up 2, Me · Watched 20, Dot & Me · Want 11, Dot & Me · Caught up 1, Fam · Want 34, Fam · Caught up 1, Fam · Watched 1.
  - 20 review candidates: Booksmart and Peacemaker conflicts, 15 loose-note pieces, 2 IMDb bookmarks, and Guerrera (TMDB can't resolve tt34379559).
  - Numbers will differ if you've edited Notion since.
- [ ] Skim the report: every Notion title you care about is either counted or listed as a review candidate.
- [ ] `npm run import:notion` (about 3 minutes) ends with "Created N items and M review candidates", matching the dry run.
- [ ] Spot checks in the app:
  - [ ] *The Amateur* and *Restrepo* are **movies** on Me · Want.
  - [ ] *Tehran* is Me · Caught up. Its sheet says "Caught up through season 3".
  - [ ] *The Studio* and *This Is What Winning Looks Like* (loose linked titles) are on Me.
  - [ ] TV "Watched" section titles are on Me · Watched.
  - [ ] Newest sort roughly follows the order you added things in Notion.
- [ ] Run `npm run import:notion` again: "Items to import: 0", "Review candidates: 0 (+N already created…)".
- [ ] The header shows **Needs review N**, and tapping it opens `/review`.
- [ ] **Booksmart** card: says "Already on Me · Want to watch" and suggests Fam. **Move here** moves it to Fam, and the card disappears.
- [ ] A loose note (e.g. "Dunkirk") → **Add**: it appears on Me · Want.
- [ ] "pop stars" → **Pick a different match** → search "Popstar" → pick *Popstar: Never Stop Never Stopping* → **Add**.
- [ ] "Mike birbiglia shows" has no guess: Add is disabled until you pick a match. **Dismiss** removes it.
- [ ] "the boys" (already on Me · Want) shows **Keep as is**.
- [ ] You can change the list/status dropdowns on a card before accepting.
- [ ] When the queue is empty, the page says "All done", and the header badge disappears.

## After cutover (milestone 6, on Vercel)

- [ ] Vercel → Settings → Cron Jobs lists `/api/cron/refresh` daily at 10:00 UTC.
- [ ] The day after deploy, Vercel → Logs shows a `cron refresh` line with an empty `errors` list.
