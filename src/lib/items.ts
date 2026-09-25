import "server-only";
import { Prisma, type Item } from "@prisma/client";
import { prisma } from "./db";
import { getRatings } from "./omdb";
import { getDetails } from "./tmdb";
import type { ItemSummary, ItemView, ListKey, MediaKind, Ratings, StatusKey, TitleDetails } from "./types";

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

/** Status plus the columns that go with it: Watched stamps watchedAt, Caught up records the season count. */
export function statusFields(status: StatusKey, seasonCount: number | null, prev?: { watchedAt: Date | null; caughtUpSeason: number | null }) {
  return {
    status,
    watchedAt: status === "WATCHED" ? (prev?.watchedAt ?? new Date()) : null,
    caughtUpSeason: status === "CAUGHT_UP" ? seasonCount : status === "WANT" ? null : (prev?.caughtUpSeason ?? null),
  };
}

export function isDuplicateError(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
}

/**
 * Creates an item from fresh TMDB details and OMDb ratings. Throws a P2002 error (see isDuplicateError)
 * if the title already exists; the unique constraint is the duplicate guarantee.
 */
export async function createItem(input: {
  mediaType: MediaKind;
  tmdbId: number;
  list: ListKey;
  status?: StatusKey;
  addedAt?: Date;
  importedFrom?: string;
}): Promise<Item> {
  const details = await getDetails(input.mediaType, input.tmdbId);
  const ratings = await getRatings(details.imdbId);
  // Movies only have Want / Watched.
  const status = input.mediaType === "MOVIE" && (input.status === "WATCHING" || input.status === "CAUGHT_UP") ? "WANT" : (input.status ?? "WANT");
  return prisma.item.create({
    data: {
      mediaType: input.mediaType,
      tmdbId: input.tmdbId,
      list: input.list,
      ...metadataFields(details, ratings),
      ...statusFields(status, details.seasonCount),
      ...(input.addedAt ? { addedAt: input.addedAt } : {}),
      importedFrom: input.importedFrom ?? null,
    },
  });
}
