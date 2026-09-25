// Types shared by server and client code.

export type MediaKind = "MOVIE" | "TV";
export type ListKey = "ME" | "DOT_AND_ME" | "FAM";
export type StatusKey = "WANT" | "WATCHING" | "CAUGHT_UP" | "WATCHED";

/** A TMDB search hit, normalized. */
export interface SearchResult {
  mediaType: MediaKind;
  tmdbId: number;
  title: string;
  year: number | null;
  posterPath: string | null;
  overview: string | null;
  popularity: number;
}

/** Full TMDB details for one title, normalized to the Item columns. */
export interface TitleDetails {
  mediaType: MediaKind;
  tmdbId: number;
  imdbId: string | null;
  title: string;
  year: number | null;
  endYear: number | null;
  overview: string | null;
  posterPath: string | null;
  runtimeMinutes: number | null;
  genres: string[];
  tvStatus: string | null;
  seasonCount: number | null;
  episodeCount: number | null;
  nextAirDate: string | null; // ISO date
  nextSeason: number | null;
  nextEpisode: number | null;
  seasons: SeasonInfo[];
}

export interface SeasonInfo {
  number: number;
  name: string;
  airDate: string | null;
  episodeCount: number;
}

export interface Ratings {
  rtScore: number | null;
  imdbRating: number | null;
}

/** What the client knows about a title already in the database. */
export interface ItemSummary {
  id: string;
  mediaType: MediaKind;
  tmdbId: number;
  title: string;
  year: number | null;
  posterPath: string | null;
  list: ListKey;
  status: StatusKey;
  addedAt: string; // ISO
}
