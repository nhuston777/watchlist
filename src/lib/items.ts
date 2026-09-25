import "server-only";
import type { Item } from "@prisma/client";
import { prisma } from "./db";
import type { ItemSummary, ItemView, Ratings, TitleDetails } from "./types";

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

export function toView(item: Item): ItemView {
  return {
    ...toSummary(item),
    imdbId: item.imdbId,
    endYear: item.endYear,
    overview: item.overview,
    runtimeMinutes: item.runtimeMinutes,
    genres: item.genres,
    tvStatus: item.tvStatus,
    seasonCount: item.seasonCount,
    episodeCount: item.episodeCount,
    nextAirDate: item.nextAirDate?.toISOString() ?? null,
    nextSeason: item.nextSeason,
    nextEpisode: item.nextEpisode,
    rtScore: item.rtScore,
    imdbRating: item.imdbRating,
    caughtUpSeason: item.caughtUpSeason,
    note: item.note,
    watchedAt: item.watchedAt?.toISOString() ?? null,
    metadataAt: item.metadataAt.toISOString(),
  };
}

/** Every title in the database, small enough to ship to the client for instant duplicate checks. */
export async function getAllItems(): Promise<ItemView[]> {
  const items = await prisma.item.findMany({ orderBy: { addedAt: "desc" } });
  return items.map(toView);
}

export async function findExisting(mediaType: TitleDetails["mediaType"], tmdbId: number): Promise<ItemSummary | null> {
  const item = await prisma.item.findUnique({ where: { mediaType_tmdbId: { mediaType, tmdbId } } });
  return item ? toSummary(item) : null;
}

/** Item columns from fresh TMDB details. */
export function detailsFields(d: TitleDetails) {
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
    metadataAt: new Date(),
  };
}

/** Item columns from an OMDb lookup. ratingsAt stays null when there was no IMDb id to look up. */
export function ratingsFields(r: Ratings, imdbId: string | null) {
  return { rtScore: r.rtScore, imdbRating: r.imdbRating, ratingsAt: imdbId ? new Date() : null };
}

/** Item columns from fresh TMDB details + OMDb ratings. */
export function metadataFields(d: TitleDetails, r: Ratings) {
  return { ...detailsFields(d), ...ratingsFields(r, d.imdbId) };
}
