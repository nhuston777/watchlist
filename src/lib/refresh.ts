import "server-only";
import { prisma } from "./db";
import { detailsFields, ratingsFields } from "./items";
import { getRatings } from "./omdb";
import { hasNewSeason } from "./progress";
import { getDetails } from "./tmdb";

const RATINGS_MAX_AGE_DAYS = 30;
const RATINGS_CAP = 200; // OMDb's free tier allows 1,000/day
const CONCURRENCY = 5;

export interface RefreshReport {
  tvChecked: number;
  tvUpdated: number;
  newSeasons: string[];
  ratingsChecked: number;
  ratingsUpdated: number;
  errors: string[];
}

async function inBatches<T>(items: T[], fn: (item: T) => Promise<void>): Promise<void> {
  for (let i = 0; i < items.length; i += CONCURRENCY) {
    await Promise.all(items.slice(i, i + CONCURRENCY).map(fn));
  }
}

/**
 * The daily job:
 * 1. Every show not marked Watched gets fresh TMDB details (season count, next air date, status).
 *    A caught-up show whose season count grows is what surfaces the "New season" flag.
 * 2. Ratings older than 30 days (or never fetched) are refreshed from OMDb, oldest first, capped at 200.
 */
export async function runDailyRefresh(): Promise<RefreshReport> {
  const report: RefreshReport = { tvChecked: 0, tvUpdated: 0, newSeasons: [], ratingsChecked: 0, ratingsUpdated: 0, errors: [] };

  const shows = await prisma.item.findMany({ where: { mediaType: "TV", status: { not: "WATCHED" } } });
  await inBatches(shows, async (show) => {
    report.tvChecked++;
    try {
      const d = await getDetails("TV", show.tmdbId, 0);
      const fields = detailsFields(d);
      const updated = await prisma.item.update({ where: { id: show.id }, data: fields });
      report.tvUpdated++;
      if (hasNewSeason(updated) && !hasNewSeason(show)) report.newSeasons.push(updated.title);
    } catch (e) {
      report.errors.push(`TMDB ${show.title}: ${e instanceof Error ? e.message : String(e)}`);
    }
  });

  const cutoff = new Date(Date.now() - RATINGS_MAX_AGE_DAYS * 86_400_000);
  const stale = await prisma.item.findMany({
    where: { imdbId: { not: null }, OR: [{ ratingsAt: null }, { ratingsAt: { lt: cutoff } }] },
    orderBy: { ratingsAt: { sort: "asc", nulls: "first" } },
    take: RATINGS_CAP,
  });
  await inBatches(stale, async (item) => {
    report.ratingsChecked++;
    try {
      const r = await getRatings(item.imdbId, 0);
      await prisma.item.update({ where: { id: item.id }, data: ratingsFields(r, item.imdbId) });
      report.ratingsUpdated++;
    } catch (e) {
      report.errors.push(`OMDb ${item.title}: ${e instanceof Error ? e.message : String(e)}`);
    }
  });

  return report;
}
