import "server-only";
import type { MediaKind, SearchResult, SeasonInfo, TitleDetails } from "./types";

const BASE = "https://api.themoviedb.org/3";

function key(): string {
  const k = process.env.TMDB_KEY;
  if (!k) throw new Error("TMDB_KEY environment variable is not set");
  return k;
}

// TMDB_KEY may be a v3 API key (32 hex chars) or a v4 read access token (a JWT).
async function tmdb<T>(path: string, params: Record<string, string> = {}, revalidate = 3600): Promise<T> {
  const k = key();
  const isToken = k.startsWith("eyJ");
  const qs = new URLSearchParams({ ...params, ...(isToken ? {} : { api_key: k }) });
  const res = await fetch(`${BASE}${path}?${qs}`, {
    headers: isToken ? { Authorization: `Bearer ${k}` } : undefined,
    next: { revalidate },
  });
  if (!res.ok) throw new Error(`TMDB ${path} failed: ${res.status}`);
  return res.json() as Promise<T>;
}

interface RawResult {
  id: number;
  media_type?: string;
  title?: string;
  name?: string;
  release_date?: string;
  first_air_date?: string;
  poster_path?: string | null;
  overview?: string;
  popularity?: number;
}

function yearOf(date: string | null | undefined): number | null {
  const y = date ? Number(date.slice(0, 4)) : NaN;
  return Number.isFinite(y) && y > 0 ? y : null;
}

function normalizeResult(r: RawResult, mediaType: MediaKind): SearchResult {
  return {
    mediaType,
    tmdbId: r.id,
    title: (mediaType === "MOVIE" ? r.title : r.name) ?? r.title ?? r.name ?? "Untitled",
    year: yearOf(mediaType === "MOVIE" ? r.release_date : r.first_air_date),
    posterPath: r.poster_path ?? null,
    overview: r.overview || null,
    popularity: r.popularity ?? 0,
  };
}

/** Search movies and shows. `type` narrows to one kind; people are dropped. */
export async function searchTitles(query: string, type?: MediaKind): Promise<SearchResult[]> {
  const params = { query, include_adult: "false" };
  if (type === "MOVIE") {
    const data = await tmdb<{ results: RawResult[] }>("/search/movie", params);
    return data.results.map((r) => normalizeResult(r, "MOVIE"));
  }
  if (type === "TV") {
    const data = await tmdb<{ results: RawResult[] }>("/search/tv", params);
    return data.results.map((r) => normalizeResult(r, "TV"));
  }
  const data = await tmdb<{ results: RawResult[] }>("/search/multi", params);
  return data.results
    .filter((r) => r.media_type === "movie" || r.media_type === "tv")
    .map((r) => normalizeResult(r, r.media_type === "movie" ? "MOVIE" : "TV"));
}

interface RawMovie {
  id: number;
  title: string;
  release_date?: string;
  runtime?: number | null;
  genres?: { name: string }[];
  overview?: string;
  poster_path?: string | null;
  imdb_id?: string | null;
  external_ids?: { imdb_id?: string | null };
}

interface RawEpisode {
  air_date?: string | null;
  season_number?: number;
  episode_number?: number;
}

interface RawTv {
  id: number;
  name: string;
  first_air_date?: string;
  last_air_date?: string;
  status?: string;
  number_of_seasons?: number;
  number_of_episodes?: number;
  next_episode_to_air?: RawEpisode | null;
  genres?: { name: string }[];
  overview?: string;
  poster_path?: string | null;
  seasons?: { season_number: number; name: string; air_date: string | null; episode_count: number }[];
  external_ids?: { imdb_id?: string | null };
}

/** Seasons that have started airing (TMDB's number_of_seasons also counts announced ones). */
function airedSeasonCount(seasons: SeasonInfo[], fallback: number | undefined): number | null {
  const today = new Date().toISOString().slice(0, 10);
  const aired = seasons.filter((s) => s.number > 0 && s.airDate && s.airDate <= today && s.episodeCount > 0);
  if (aired.length) return aired.length;
  return seasons.length ? 0 : (fallback ?? null);
}

export async function getDetails(mediaType: MediaKind, tmdbId: number, revalidate = 3600): Promise<TitleDetails> {
  if (mediaType === "MOVIE") {
    const m = await tmdb<RawMovie>(`/movie/${tmdbId}`, { append_to_response: "external_ids" }, revalidate);
    return {
      mediaType,
      tmdbId: m.id,
      imdbId: m.external_ids?.imdb_id || m.imdb_id || null,
      title: m.title,
      year: yearOf(m.release_date),
      endYear: null,
      overview: m.overview || null,
      posterPath: m.poster_path ?? null,
      runtimeMinutes: m.runtime || null,
      genres: (m.genres ?? []).map((g) => g.name),
      tvStatus: null,
      seasonCount: null,
      episodeCount: null,
      nextAirDate: null,
      nextSeason: null,
      nextEpisode: null,
      seasons: [],
    };
  }
  const t = await tmdb<RawTv>(`/tv/${tmdbId}`, { append_to_response: "external_ids" }, revalidate);
  const seasons: SeasonInfo[] = (t.seasons ?? [])
    .filter((s) => s.season_number > 0)
    .map((s) => ({ number: s.season_number, name: s.name, airDate: s.air_date || null, episodeCount: s.episode_count }));
  const finished = t.status === "Ended" || t.status === "Canceled";
  const next = t.next_episode_to_air;
  return {
    mediaType,
    tmdbId: t.id,
    imdbId: t.external_ids?.imdb_id || null,
    title: t.name,
    year: yearOf(t.first_air_date),
    endYear: finished ? yearOf(t.last_air_date) : null,
    overview: t.overview || null,
    posterPath: t.poster_path ?? null,
    runtimeMinutes: null,
    genres: (t.genres ?? []).map((g) => g.name),
    tvStatus: t.status ?? null,
    seasonCount: airedSeasonCount(seasons, t.number_of_seasons),
    episodeCount: t.number_of_episodes ?? null,
    nextAirDate: next?.air_date || null,
    nextSeason: next?.air_date ? (next.season_number ?? null) : null,
    nextEpisode: next?.air_date ? (next.episode_number ?? null) : null,
    seasons,
  };
}

/** Look up a title by IMDb id (used by the Notion import). */
export async function findByImdbId(imdbId: string): Promise<{ mediaType: MediaKind; tmdbId: number } | null> {
  const data = await tmdb<{ movie_results: RawResult[]; tv_results: RawResult[] }>(`/find/${imdbId}`, {
    external_source: "imdb_id",
  });
  if (data.movie_results[0]) return { mediaType: "MOVIE", tmdbId: data.movie_results[0].id };
  if (data.tv_results[0]) return { mediaType: "TV", tmdbId: data.tv_results[0].id };
  return null;
}
