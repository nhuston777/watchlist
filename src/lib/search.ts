import "server-only";
import { detectChooser, filterByYear, hasExactTitle, hasHints, parseQuery } from "./detect";
import { searchTitles } from "./tmdb";
import type { MediaKind, SearchResult } from "./types";

export interface SearchResponse {
  results: SearchResult[];
  /** Set when the query is genuinely ambiguous between a movie and a show. */
  chooser: { movie: SearchResult; show: SearchResult } | null;
  /** The result to preview straight away (null while a chooser is up). */
  selected: { mediaType: MediaKind; tmdbId: number } | null;
}

const MAX_RESULTS = 12;

export async function runSearch(input: string): Promise<SearchResponse> {
  const q = parseQuery(input);
  let results: SearchResult[];
  let chooser: SearchResponse["chooser"] = null;

  if (!hasHints(q)) {
    results = await searchTitles(q.raw);
    chooser = detectChooser(q.raw, results);
  } else {
    // A hint word may really be part of the title ("The Truman Show", "Blade Runner 2049"),
    // so search both ways and let an exact title match on the raw query win.
    const [asTyped, hinted] = await Promise.all([searchTitles(q.raw), searchTitles(q.text, q.type ?? undefined)]);
    if (hasExactTitle(q.raw, asTyped)) {
      results = asTyped;
      chooser = detectChooser(q.raw, results);
    } else {
      results = filterByYear(hinted, q.year);
      if (!q.type) chooser = detectChooser(q.text, results);
    }
  }

  results = results.slice(0, MAX_RESULTS);
  const top = results[0];
  return {
    results,
    chooser,
    selected: chooser || !top ? null : { mediaType: top.mediaType, tmdbId: top.tmdbId },
  };
}
