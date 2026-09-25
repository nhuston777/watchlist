import { shortDate } from "@/lib/format";
import { getDetails } from "@/lib/tmdb";

/** Season list for a show, fetched live from TMDB (cached for an hour). Streams in after the sheet opens. */
export async function Seasons({ tmdbId, caughtUpSeason }: { tmdbId: number; caughtUpSeason: number | null }) {
  let seasons;
  try {
    seasons = (await getDetails("TV", tmdbId)).seasons;
  } catch {
    return null;
  }
  if (!seasons.length) return null;
  const today = new Date().toISOString().slice(0, 10);
  return (
    <section className="detail-section">
      <h2 className="section-label">Seasons</h2>
      <ul className="season-list">
        {seasons.map((s) => {
          const upcoming = !s.airDate || s.airDate > today;
          const seen = caughtUpSeason !== null && s.number <= caughtUpSeason;
          return (
            <li key={s.number} className={`season ${upcoming ? "upcoming" : ""}`}>
              <span className="season-name">
                {seen && <span className="check" aria-label="Caught up">✓ </span>}
                {s.name}
              </span>
              <span className="season-meta">
                {s.airDate ? (upcoming ? `Airs ${shortDate(s.airDate, true)}` : s.airDate.slice(0, 4)) : "TBA"}
                {s.episodeCount ? ` · ${s.episodeCount} ep` : ""}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function SeasonsSkeleton() {
  return (
    <section className="detail-section" aria-hidden="true">
      <h2 className="section-label">Seasons</h2>
      <span className="skeleton-line shimmer" />
      <span className="skeleton-line shimmer" style={{ width: "80%" }} />
    </section>
  );
}
