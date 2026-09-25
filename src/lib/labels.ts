import type { ListKey, MediaKind, StatusKey } from "./types";

export const LISTS: ListKey[] = ["ME", "DOT_AND_ME", "FAM"];

export const LIST_LABEL: Record<ListKey, string> = {
  ME: "Me",
  DOT_AND_ME: "Dot & Me",
  FAM: "Fam",
};

export const STATUS_LABEL: Record<StatusKey, string> = {
  WANT: "Want to watch",
  WATCHING: "Watching",
  CAUGHT_UP: "Caught up",
  WATCHED: "Watched",
};

export const MEDIA_LABEL: Record<MediaKind, string> = { MOVIE: "Movie", TV: "Show" };

export function isListKey(v: unknown): v is ListKey {
  return v === "ME" || v === "DOT_AND_ME" || v === "FAM";
}

export function isMediaKind(v: unknown): v is MediaKind {
  return v === "MOVIE" || v === "TV";
}
