/** 🍅-style RT score (red tomato ≥ 60%, green splat below), else IMDb labeled as such, else a dash. */
export function RatingBadge({ rtScore, imdbRating, className = "" }: { rtScore: number | null; imdbRating: number | null; className?: string }) {
  if (rtScore !== null) {
    const fresh = rtScore >= 60;
    return (
      <span className={`rating ${className}`} title={`Rotten Tomatoes ${rtScore}%`}>
        <svg className={`rt-mark ${fresh ? "fresh" : "rotten"}`} viewBox="0 0 16 16" aria-hidden="true">
          {fresh ? (
            <>
              <circle cx="8" cy="9.5" r="6" />
              <path className="leaf" d="M5 3.5c1.5.3 2.4 1 3 2 .6-1 1.6-1.7 3-2-.6 1.4-1.6 2.3-3 2.6C6.6 5.8 5.6 4.9 5 3.5z" />
            </>
          ) : (
            <path d="M8 1.5l1.6 3.6 3.9-1.2-1.6 3.7 3.6 1.9-3.9 1 .6 3.9-3.3-2.2-2.9 2.6-.2-3.9-3.9-.3 3-2.6L2.6 5.2l3.9.6z" />
          )}
        </svg>
        {rtScore}%
      </span>
    );
  }
  if (imdbRating !== null) {
    return (
      <span className={`rating ${className}`} title={`IMDb ${imdbRating.toFixed(1)}/10`}>
        <span className="imdb-mark">IMDb</span>
        {imdbRating.toFixed(1)}
      </span>
    );
  }
  return <span className={`rating muted ${className}`}>—</span>;
}
