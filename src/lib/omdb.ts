import "server-only";
import type { Ratings } from "./types";

interface OmdbResponse {
  Response?: string;
  Ratings?: { Source: string; Value: string }[];
  imdbRating?: string;
}

/** Rotten Tomatoes Tomatometer and IMDb rating for an IMDb id. Missing values come back null. */
export async function getRatings(imdbId: string | null, revalidate = 86_400): Promise<Ratings> {
  const k = process.env.OMDB_KEY;
  if (!imdbId || !k) return { rtScore: null, imdbRating: null };
  try {
    const res = await fetch(`https://www.omdbapi.com/?apikey=${encodeURIComponent(k)}&i=${encodeURIComponent(imdbId)}`, {
      next: { revalidate },
    });
    if (!res.ok) return { rtScore: null, imdbRating: null };
    const data = (await res.json()) as OmdbResponse;
    if (data.Response !== "True") return { rtScore: null, imdbRating: null };
    const rt = data.Ratings?.find((r) => r.Source === "Rotten Tomatoes")?.Value;
    const rtScore = rt && /^\d+%$/.test(rt) ? Number(rt.slice(0, -1)) : null;
    const imdb = data.imdbRating ? Number(data.imdbRating) : NaN;
    return { rtScore, imdbRating: Number.isFinite(imdb) ? imdb : null };
  } catch {
    return { rtScore: null, imdbRating: null };
  }
}
