import type { StatusKey } from "./types";

// TV progress rules, shared by server and client.

/** A caught-up show whose season count has grown since it was marked caught up. */
export function hasNewSeason(item: { status: StatusKey; seasonCount: number | null; caughtUpSeason: number | null }): boolean {
  return (
    item.status === "CAUGHT_UP" &&
    item.seasonCount !== null &&
    item.caughtUpSeason !== null &&
    item.seasonCount > item.caughtUpSeason
  );
}

export const MOVIE_STATUSES: StatusKey[] = ["WANT", "WATCHED"];
export const TV_STATUSES: StatusKey[] = ["WANT", "WATCHING", "CAUGHT_UP", "WATCHED"];
