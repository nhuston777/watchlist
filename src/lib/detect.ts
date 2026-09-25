import type { MediaKind, SearchResult } from "./types";

// Query hints and movie-vs-show detection. Pure functions, used on the server
// by /api/search and on the client for the instant local check.

/** Lowercase, strip accents, "&" → "and", drop punctuation and a leading "the"/"a"/"an". */
export function normalizeTitle(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/^(the|a|an) /, "");
}

const MOVIE_WORDS = new Set(["movie", "movies", "film", "films"]);
const SHOW_WORDS = new Set(["show", "shows", "series", "tv"]);

export interface ParsedQuery {
  /** The query as typed, trimmed. */
  raw: string;
  /** The query with any hint words / year removed (same as raw when there are none). */
  text: string;
  type: MediaKind | null;
  year: number | null;
}

/**
 * Pulls hints off the start or end of a query: "dune movie", "tv the office", "dune 2021".
 * Hints only apply when something is left over, so "1917" and "tv" stay plain searches.
 * Callers should still prefer an exact title match on the raw query ("The Truman Show").
 */
export function parseQuery(input: string): ParsedQuery {
  const raw = input.trim().replace(/\s+/g, " ");
  const words = raw.split(" ");
  let type: MediaKind | null = null;
  let year: number | null = null;
  const maxYear = new Date().getFullYear() + 5;

  const takeHint = (w: string): boolean => {
    const lw = w.toLowerCase().replace(/[()]/g, "");
    if (!type && MOVIE_WORDS.has(lw)) type = "MOVIE";
    else if (!type && SHOW_WORDS.has(lw)) type = "TV";
    else if (!year && /^\d{4}$/.test(lw) && Number(lw) >= 1900 && Number(lw) <= maxYear) year = Number(lw);
    else return false;
    return true;
  };

  // Peel hints off the end, then the start, keeping at least one word.
  while (words.length > 1 && takeHint(words[words.length - 1])) words.pop();
  while (words.length > 1 && takeHint(words[0])) words.shift();

  return { raw, text: words.join(" "), type, year };
}

export function hasHints(q: ParsedQuery): boolean {
  return q.type !== null || q.year !== null;
}

/** Narrow results by a year hint (±1 for release-date drift); keep everything if nothing matches. */
export function filterByYear(results: SearchResult[], year: number | null): SearchResult[] {
  if (!year) return results;
  const hits = results.filter((r) => r.year !== null && Math.abs(r.year - year) <= 1);
  return hits.length ? hits : results;
}

export interface Chooser {
  movie: SearchResult;
  show: SearchResult;
}

/**
 * Decide whether to ask "the movie or the show?".
 * Ask when the top movie and top show are within ~3× popularity of each other, or when both
 * match the typed title exactly and neither is overwhelmingly more popular (10×). The 10× cap
 * keeps an obscure same-named film from interrupting a popular show (Severance, 2006).
 */
export function detectChooser(query: string, results: SearchResult[]): Chooser | null {
  const movie = results.find((r) => r.mediaType === "MOVIE");
  const show = results.find((r) => r.mediaType === "TV");
  if (!movie || !show) return null;
  const hi = Math.max(movie.popularity, show.popularity);
  const lo = Math.min(movie.popularity, show.popularity);
  const ratio = lo > 0 ? hi / lo : Infinity;
  const q = normalizeTitle(query);
  const bothExact = normalizeTitle(movie.title) === q && normalizeTitle(show.title) === q;
  if (ratio <= 3 || (bothExact && ratio <= 10)) return { movie, show };
  return null;
}

/** Does any result's title exactly match the query? Used to ignore hint words that are part of a title. */
export function hasExactTitle(query: string, results: SearchResult[]): boolean {
  const q = normalizeTitle(query);
  return results.some((r) => normalizeTitle(r.title) === q);
}

/** Local "already on your lists" matching: every query word must start a word in the title. */
export function matchesLocal(title: string, query: string): boolean {
  const q = normalizeTitle(query);
  if (q.length < 2) return false;
  const t = normalizeTitle(title);
  if (t.includes(q)) return true;
  const titleWords = t.split(" ");
  return q.split(" ").every((qw) => titleWords.some((tw) => tw.startsWith(qw)));
}
