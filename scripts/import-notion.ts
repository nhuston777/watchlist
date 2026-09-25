// One-time import of the v1 Notion watchlist.
//
//   npm run import:notion -- --dry-run   # read Notion + TMDB, print the report, write nothing
//   npm run import:notion                # same report, then write items and review candidates
//
// Needs NOTION_TOKEN, TMDB_KEY, DATABASE_URL (and OMDB_KEY for ratings on a real run).
// Idempotent: titles already in the database and review candidates already created are skipped,
// so it's safe to re-run.

import type { ListName, MediaType, Status } from "@prisma/client";
import { prisma } from "../src/lib/db";
import { createItem, isDuplicateError } from "../src/lib/items";
import { LIST_LABEL, STATUS_LABEL } from "../src/lib/labels";
import { normalizeTitle } from "../src/lib/detect";
import { findByImdbId, getDetails, searchTitles } from "../src/lib/tmdb";
import type { ListKey, MediaKind, SearchResult, StatusKey } from "../src/lib/types";
import { readNotion, splitNote, type TitleEntry } from "./notion";

const dryRun = process.argv.includes("--dry-run");

interface Planned {
  entry: TitleEntry;
  mediaType: MediaKind;
  tmdbId: number;
  list: ListKey;
  status: StatusKey;
}

interface Candidate {
  rawText: string;
  source: string;
  suggestedList: ListKey;
  suggestedStatus: StatusKey;
  mediaType: MediaKind | null;
  tmdbId: number | null;
  reason: string;
  /** For the report only. */
  guess?: string;
}

/**
 * TMDB's best guess for free text: the most popular exact title match, unless it's obscure next to
 * the top result (<1/10 as popular), else the top result.
 */
async function bestGuess(text: string): Promise<SearchResult | null> {
  const results = await searchTitles(text);
  const top = results[0];
  if (!top) return null;
  const q = normalizeTitle(text);
  const exact = results.filter((r) => normalizeTitle(r.title) === q).sort((a, b) => b.popularity - a.popularity)[0];
  return exact && exact.popularity >= top.popularity / 10 ? exact : top;
}

const describe = (r: { title: string; mediaType: MediaKind; year: number | null }) =>
  `${r.title} (${r.mediaType === "TV" ? "Show" : "Movie"}${r.year ? `, ${r.year}` : ""})`;

const label = (list: ListKey, status: StatusKey) => `${LIST_LABEL[list]} · ${STATUS_LABEL[status]}`;
const keyOf = (mediaType: MediaKind, tmdbId: number) => `${mediaType}:${tmdbId}`;

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`Missing ${name}. See .env.example.`);
    process.exit(1);
  }
  return v;
}

async function main() {
  const token = requireEnv("NOTION_TOKEN");
  requireEnv("TMDB_KEY");
  requireEnv("DATABASE_URL");
  if (!dryRun && !process.env.OMDB_KEY) console.warn("OMDB_KEY is not set: items will import without ratings (the daily refresh fills them in).");

  const notion = await readNotion(token);

  // 1. Resolve every linked title through TMDB /find. The media type comes from TMDB, not the page.
  process.stderr.write(`Resolving ${notion.entries.length} titles on TMDB…\n`);
  const findCache = new Map<string, { mediaType: MediaKind; tmdbId: number } | null>();
  const find = async (imdbId: string) => {
    if (!findCache.has(imdbId)) findCache.set(imdbId, await findByImdbId(imdbId));
    return findCache.get(imdbId)!;
  };

  const plan = new Map<string, Planned>();
  const candidates: Candidate[] = [];
  const unresolved: string[] = [];
  let silentDuplicates = 0;
  let typeCorrections = 0;

  for (const entry of notion.entries) {
    const hit = entry.imdbId ? await find(entry.imdbId) : null;
    if (!hit) {
      unresolved.push(`${entry.title} (${entry.imdbId ?? "no IMDb link"}) on ${entry.page.name} → ${entry.section}`);
      const guess = await bestGuess(entry.title);
      candidates.push({
        rawText: entry.title,
        source: entry.source,
        suggestedList: entry.list,
        suggestedStatus: entry.status,
        mediaType: guess?.mediaType ?? null,
        tmdbId: guess?.tmdbId ?? null,
        reason: entry.imdbId ? `no TMDB match for ${entry.imdbId}` : "no IMDb link in Notion",
        guess: guess ? `${describe(guess)}, by title search` : undefined,
      });
      continue;
    }
    if ((entry.page.key === "tv") !== (hit.mediaType === "TV")) typeCorrections++;
    // "✅ Caught up" only means something for shows.
    const status: StatusKey = hit.mediaType === "TV" && entry.caughtUp && entry.status === "WANT" ? "CAUGHT_UP" : entry.status;
    const key = keyOf(hit.mediaType, hit.tmdbId);
    const first = plan.get(key);
    if (!first) {
      plan.set(key, { entry, ...hit, list: entry.list, status });
    } else if (first.list === entry.list && first.status === status) {
      silentDuplicates++;
    } else {
      candidates.push({
        rawText: entry.title,
        source: entry.source,
        suggestedList: entry.list,
        suggestedStatus: status,
        ...hit,
        reason: `duplicate in Notion: also on ${label(first.list, first.status)}`,
      });
    }
  }

  // 2. Titles already in the database are skipped (re-runs, or things added in the app since).
  const existing = await prisma.item.findMany({ select: { mediaType: true, tmdbId: true, list: true, status: true, title: true } });
  const inDb = new Map(existing.map((i) => [keyOf(i.mediaType, i.tmdbId), i]));
  const toImport = [...plan.values()].filter((p) => !inDb.has(keyOf(p.mediaType, p.tmdbId)));
  const alreadyInDb = plan.size - toImport.length;

  const whereIs = (mediaType: MediaKind, tmdbId: number): string | null => {
    const k = keyOf(mediaType, tmdbId);
    const p = plan.get(k) ?? inDb.get(k);
    return p ? label(p.list, p.status) : null;
  };

  // 3. Loose plain-text notes: one candidate per comma-separated piece, with TMDB's best guess.
  process.stderr.write(`Guessing ${notion.notes.length} loose notes…\n`);
  for (const note of notion.notes) {
    for (const piece of splitNote(note.text)) {
      const best = await bestGuess(piece);
      const on = best ? whereIs(best.mediaType, best.tmdbId) : null;
      candidates.push({
        rawText: piece,
        source: `notion:${note.page.key}:loose-note`,
        suggestedList: note.list,
        suggestedStatus: note.status,
        mediaType: best?.mediaType ?? null,
        tmdbId: best?.tmdbId ?? null,
        reason: !best ? "loose note (no TMDB match)" : on ? `loose note (already on ${on})` : "loose note",
        guess: best ? describe(best) : undefined,
      });
    }
  }

  // 4. IMDb bookmarks: real titles, but saved in a different shape, so they go to review.
  for (const bm of notion.bookmarks) {
    const hit = bm.imdbId ? await find(bm.imdbId) : null;
    const on = hit ? whereIs(hit.mediaType, hit.tmdbId) : null;
    candidates.push({
      rawText: bm.url,
      source: `${bm.source}:bookmark`,
      suggestedList: bm.list,
      suggestedStatus: bm.status,
      mediaType: hit?.mediaType ?? null,
      tmdbId: hit?.tmdbId ?? null,
      reason: !hit ? `IMDb bookmark in Notion (no TMDB match for ${bm.imdbId})` : on ? `IMDb bookmark in Notion (already on ${on})` : "IMDb bookmark in Notion",
    });
    if (!hit) unresolved.push(`bookmark ${bm.url}`);
  }

  // 5. Candidates already created by an earlier run are skipped.
  const prior = await prisma.reviewCandidate.findMany({ select: { source: true, rawText: true } });
  const priorKeys = new Set(prior.map((c) => `${c.source}|${c.rawText}`));
  const newCandidates = candidates.filter((c) => !priorKeys.has(`${c.source}|${c.rawText}`));

  // Titles for candidates with a TMDB id but no guess text yet (duplicates, bookmarks).
  for (const c of newCandidates) {
    if (c.guess || c.tmdbId === null || c.mediaType === null) continue;
    c.guess = await getDetails(c.mediaType, c.tmdbId)
      .then(describe)
      .catch(() => `TMDB ${c.mediaType!.toLowerCase()} ${c.tmdbId}`);
  }

  printReport({ notion, toImport, alreadyInDb, silentDuplicates, typeCorrections, candidates: newCandidates, skippedCandidates: candidates.length - newCandidates.length, unresolved });

  if (dryRun) {
    console.log("\nDry run: nothing was written.");
    return;
  }

  // 6. Write. Items one at a time (TMDB + OMDb per item); the unique constraint still guards duplicates.
  console.log(`\nImporting ${toImport.length} items…`);
  let created = 0;
  const failures: string[] = [];
  for (const p of toImport) {
    try {
      await createItem({
        mediaType: p.mediaType,
        tmdbId: p.tmdbId,
        list: p.list,
        status: p.status,
        addedAt: new Date(p.entry.createdTime),
        importedFrom: p.entry.source,
      });
      created++;
      if (created % 20 === 0) process.stderr.write(`  ${created}/${toImport.length}\n`);
    } catch (e) {
      if (isDuplicateError(e)) continue;
      failures.push(`${p.entry.title}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  // One insert per candidate (there are only a handful), so it also works over drivers without transactions.
  for (const c of newCandidates) {
    await prisma.reviewCandidate.create({
      data: {
        rawText: c.rawText,
        source: c.source,
        suggestedList: c.suggestedList as ListName,
        suggestedStatus: c.suggestedStatus as Status,
        mediaType: c.mediaType as MediaType | null,
        tmdbId: c.tmdbId,
        reason: c.reason,
      },
    });
  }
  console.log(`Created ${created} items and ${newCandidates.length} review candidates.`);
  if (failures.length) {
    console.log(`\n${failures.length} items failed (re-run the import to retry them):`);
    for (const f of failures) console.log(`  - ${f}`);
    process.exitCode = 1;
  }
}

function printReport(r: {
  notion: Awaited<ReturnType<typeof readNotion>>;
  toImport: Planned[];
  alreadyInDb: number;
  silentDuplicates: number;
  typeCorrections: number;
  candidates: Candidate[];
  skippedCandidates: number;
  unresolved: string[];
}) {
  const { notion } = r;
  console.log("\n=== Notion import report ===");
  console.log(`Read ${notion.entries.length} linked titles, ${notion.notes.length} loose notes and ${notion.bookmarks.length} IMDb bookmarks (${notion.requests} Notion requests).`);
  console.log(`\nItems to import: ${r.toImport.length}`);
  console.log(`  already in the database (skipped): ${r.alreadyInDb}`);
  console.log(`  same title twice in Notion, same list/status (imported once): ${r.silentDuplicates}`);
  console.log(`  filed on the other page type (TMDB's type used): ${r.typeCorrections}`);

  const rows: string[][] = [];
  const lists: ListKey[] = ["ME", "DOT_AND_ME", "FAM"];
  const statuses: StatusKey[] = ["WANT", "WATCHING", "CAUGHT_UP", "WATCHED"];
  for (const list of lists) {
    for (const status of statuses) {
      const here = r.toImport.filter((p) => p.list === list && p.status === status);
      if (!here.length) continue;
      const movies = here.filter((p) => p.mediaType === "MOVIE").length;
      rows.push([label(list, status), String(here.length), `${movies} movies, ${here.length - movies} shows`]);
    }
  }
  const w = Math.max(...rows.map((row) => row[0].length), 10);
  console.log("\nBy list and status:");
  for (const [name, n, split] of rows) console.log(`  ${name.padEnd(w)}  ${n.padStart(4)}   (${split})`);

  console.log(`\nReview candidates: ${r.candidates.length}${r.skippedCandidates ? ` (+${r.skippedCandidates} already created by an earlier run)` : ""}`);
  for (const c of r.candidates) {
    console.log(`  - "${c.rawText}" [${c.reason}] → ${c.guess ?? "no guess"} · suggest ${label(c.suggestedList, c.suggestedStatus)}`);
  }

  console.log(`\nUnresolved IMDb ids: ${r.unresolved.length}`);
  for (const u of r.unresolved) console.log(`  - ${u}`);

  if (notion.warnings.length) {
    console.log("\nWarnings:");
    for (const wmsg of notion.warnings) console.log(`  - ${wmsg}`);
  }
  console.log("\nSkipped blocks:", Object.entries(notion.skipped).map(([k, v]) => `${k} ×${v}`).join(", ") || "none");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
