import { MEDIA_LABEL } from "./labels";
import type { MediaKind } from "./types";

// Pure formatting helpers, safe on server and client.

export interface MetaFields {
  mediaType: MediaKind;
  year: number | null;
  endYear?: number | null;
  runtimeMinutes?: number | null;
  tvStatus?: string | null;
  seasonCount?: number | null;
  nextAirDate?: string | Date | null;
  nextSeason?: number | null;
  nextEpisode?: number | null;
}

export function runtimeLabel(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? `${h}h${m ? ` ${m}m` : ""}` : `${m}m`;
}

export function shortDate(d: string | Date, withYear = false): string {
  const date = typeof d === "string" ? new Date(d.length === 10 ? `${d}T12:00:00Z` : d) : d;
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(withYear ? { year: "numeric" } : {}),
    timeZone: "UTC",
  });
}

function isFinished(tvStatus: string | null | undefined): boolean {
  return tvStatus === "Ended" || tvStatus === "Canceled";
}

export function yearsLabel(f: MetaFields): string | null {
  if (!f.year) return null;
  if (f.mediaType === "MOVIE") return String(f.year);
  if (isFinished(f.tvStatus)) return f.endYear && f.endYear !== f.year ? `${f.year}–${f.endYear}` : String(f.year);
  return `${f.year}–`;
}

/** "Movie · 2016 · 1h 56m" or "Show · 2022– · 3 seasons · S4 airs Mar 12". */
export function metaLine(f: MetaFields): string {
  const parts: string[] = [MEDIA_LABEL[f.mediaType]];
  const years = yearsLabel(f);
  if (years) parts.push(years);
  if (f.mediaType === "MOVIE") {
    if (f.runtimeMinutes) parts.push(runtimeLabel(f.runtimeMinutes));
    return parts.join(" · ");
  }
  if (f.seasonCount) parts.push(`${f.seasonCount} season${f.seasonCount === 1 ? "" : "s"}`);
  if (isFinished(f.tvStatus)) {
    parts.push(f.tvStatus!);
  } else if (f.nextAirDate && new Date(f.nextAirDate).getTime() > Date.now() - 86_400_000) {
    const when = shortDate(f.nextAirDate);
    if (f.nextSeason && f.nextEpisode === 1) parts.push(`S${f.nextSeason} airs ${when}`);
    else if (f.nextSeason && f.nextEpisode) parts.push(`S${f.nextSeason}E${f.nextEpisode} airs ${when}`);
    else parts.push(`Next episode ${when}`);
  }
  return parts.join(" · ");
}

export function posterUrl(path: string, size: "w92" | "w185" | "w342" | "w500" = "w342"): string {
  return `https://image.tmdb.org/t/p/${size}${path}`;
}
