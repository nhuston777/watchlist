import "server-only";
import type { Item } from "@prisma/client";
import { prisma } from "./db";
import type { ItemSummary, Ratings, TitleDetails } from "./types";

export function toSummary(item: Item): ItemSummary {
  return {
    id: item.id,
    mediaType: item.mediaType,
    tmdbId: item.tmdbId,
    title: item.title,
    year: item.year,
    posterPath: item.posterPath,
    list: item.list,
    status: item.status,
    addedAt: item.addedAt.toISOString(),
  };
}

/** Every title in the database, small enough to ship to the client for instant duplicate checks. */
export async function getIndex(): Promise<ItemSummary[]> {
  const items = await prisma.item.findMany({ orderBy: { addedAt: "desc" } });
  return items.map(toSummary);
}

export async function findExisting(mediaType: TitleDetails["mediaType"], tmdbId: number): Promise<ItemSummary | null> {
  const item = await prisma.item.findUnique({ where: { mediaType_tmdbId: { mediaType, tmdbId } } });
  return item ? toSummary(item) : null;
}

/** Item columns from fresh TMDB details + OMDb ratings. */
export function metadataFields(d: TitleDetails, r: Ratings) {
  const now = new Date();
  return {
    imdbId: d.imdbId,
    title: d.title,
    year: d.year,
    endYear: d.endYear,
    overview: d.overview,
    posterPath: d.posterPath,
    runtimeMinutes: d.runtimeMinutes,
    genres: d.genres,
    tvStatus: d.tvStatus,
    seasonCount: d.seasonCount,
    episodeCount: d.episodeCount,
    nextAirDate: d.nextAirDate ? new Date(`${d.nextAirDate}T12:00:00Z`) : null,
    nextSeason: d.nextSeason,
    nextEpisode: d.nextEpisode,
    rtScore: r.rtScore,
    imdbRating: r.imdbRating,
    metadataAt: now,
    ratingsAt: d.imdbId ? now : null,
  };
}
