"use client";

import { useEffect, useState, useTransition } from "react";
import { acceptCandidate, dismissCandidate } from "@/app/actions/review";
import { Poster } from "@/components/Poster";
import { LIST_LABEL, LISTS, MEDIA_LABEL, STATUS_LABEL } from "@/lib/labels";
import { MOVIE_STATUSES, TV_STATUSES } from "@/lib/progress";
import type { ListKey, MediaKind, SearchResult, StatusKey } from "@/lib/types";

export interface Guess {
  mediaType: MediaKind;
  tmdbId: number;
  title: string;
  year: number | null;
  posterPath: string | null;
}

export interface ReviewRow {
  id: string;
  rawText: string;
  source: string;
  reason: string;
  suggestedList: ListKey;
  suggestedStatus: StatusKey;
  guess: Guess | null;
}

export function ReviewQueue({ rows, onLists }: { rows: ReviewRow[]; onLists: Record<string, string> }) {
  if (!rows.length) return <p className="empty">All done. Nothing left to review.</p>;
  return (
    <ul className="review-list">
      {rows.map((row) => (
        <ReviewCard key={row.id} row={row} onLists={onLists} />
      ))}
    </ul>
  );
}

function sourceLabel(source: string): string {
  // "notion:tv:Dot & Me" → "TV Shows → Dot & Me"
  const [, page, section, extra] = source.split(":");
  const pageName = page === "tv" ? "TV Shows" : page === "fam" ? "Movies for the Fam" : "Movie List";
  const sec = section === "top" ? "top of page" : section === "loose-note" ? "loose note" : section;
  return `${pageName} → ${sec}${extra ? ` (${extra})` : ""}`;
}

function ReviewCard({ row, onLists }: { row: ReviewRow; onLists: Record<string, string> }) {
  const [guess, setGuess] = useState<Guess | null>(row.guess);
  const [list, setList] = useState<ListKey>(row.suggestedList);
  const [status, setStatus] = useState<StatusKey>(row.suggestedStatus);
  const [picking, setPicking] = useState(!row.guess);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const statuses = guess?.mediaType === "TV" ? TV_STATUSES : MOVIE_STATUSES;
  const effectiveStatus = statuses.includes(status) ? status : "WANT";
  const already = guess ? onLists[`${guess.mediaType}:${guess.tmdbId}`] : undefined;
  const target = `${LIST_LABEL[list]} · ${STATUS_LABEL[effectiveStatus]}`;
  const acceptLabel = !already ? "Add" : already === target ? "Keep as is" : "Move here";
  const isUrl = row.rawText.startsWith("http");

  return (
    <li className="review-card">
      <div className="review-head">
        <p className="review-raw">{isUrl ? <a href={row.rawText} target="_blank" rel="noreferrer">IMDb bookmark</a> : `“${row.rawText}”`}</p>
        <p className="help">
          {row.reason} · {sourceLabel(row.source)}
        </p>
      </div>

      {guess ? (
        <div className="review-guess">
          <Poster path={guess.posterPath} title={guess.title} size="w185" className="thumb-lg" />
          <div className="result-text">
            <span className="result-title">{guess.title}</span>
            <span className="result-meta">
              <span className={`type-badge ${guess.mediaType === "TV" ? "tv" : ""}`}>{MEDIA_LABEL[guess.mediaType]}</span>
              {guess.year ?? ""}
            </span>
            {already && <span className="on-list-badge left">Already on {already}</span>}
          </div>
        </div>
      ) : (
        <p className="notice">No match yet. Search for the right title below.</p>
      )}

      {picking && (
        <MatchPicker
          initial={isUrl ? "" : row.rawText}
          onPick={(r) => {
            setGuess({ mediaType: r.mediaType, tmdbId: r.tmdbId, title: r.title, year: r.year, posterPath: r.posterPath });
            setPicking(false);
          }}
        />
      )}

      <div className="review-controls">
        <label className="status-select">
          <span className="visually-hidden">List</span>
          <select value={list} onChange={(e) => setList(e.target.value as ListKey)}>
            {LISTS.map((l) => (
              <option key={l} value={l}>
                {LIST_LABEL[l]}
              </option>
            ))}
          </select>
        </label>
        <label className="status-select">
          <span className="visually-hidden">Status</span>
          <select value={effectiveStatus} onChange={(e) => setStatus(e.target.value as StatusKey)}>
            {statuses.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="dup-actions">
        <button
          type="button"
          className="btn small primary"
          disabled={!guess || pending}
          onClick={() =>
            startTransition(async () => {
              setError(null);
              const res = await acceptCandidate(row.id, { mediaType: guess!.mediaType, tmdbId: guess!.tmdbId, list, status: effectiveStatus });
              if (!res.ok) setError(res.error ?? "Couldn't accept.");
            })
          }
        >
          {acceptLabel}
        </button>
        <button type="button" className="btn small" onClick={() => setPicking((p) => !p)} aria-expanded={picking}>
          {picking ? "Cancel search" : "Pick a different match"}
        </button>
        <button type="button" className="btn small ghost" disabled={pending} onClick={() => startTransition(() => dismissCandidate(row.id))}>
          Dismiss
        </button>
      </div>
      {error && <p className="form-error">{error}</p>}
    </li>
  );
}

function MatchPicker({ initial, onPick }: { initial: string; onPick: (r: SearchResult) => void }) {
  const [query, setQuery] = useState(initial);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const q = query.trim();

  useEffect(() => {
    if (q.length < 2) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: controller.signal });
        const data = await res.json();
        setResults(data.results ?? []);
      } catch {
        // aborted or offline: keep the previous results
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [q]);

  return (
    <div className="picker">
      <input className="input" type="search" placeholder="Search TMDB" value={query} onChange={(e) => setQuery(e.target.value)} autoFocus aria-label="Search for the right title" />
      <ul className={`result-list ${loading ? "stale" : ""}`}>
        {q.length >= 2 &&
          results.slice(0, 6).map((r) => (
            <li key={`${r.mediaType}:${r.tmdbId}`}>
              <button type="button" className="result-row" onClick={() => onPick(r)}>
                <Poster path={r.posterPath} title={r.title} size="w92" className="thumb" />
                <span className="result-text">
                  <span className="result-title">{r.title}</span>
                  <span className="result-meta">
                    <span className={`type-badge ${r.mediaType === "TV" ? "tv" : ""}`}>{MEDIA_LABEL[r.mediaType]}</span>
                    {r.year ?? ""}
                  </span>
                </span>
              </button>
            </li>
          ))}
      </ul>
    </div>
  );
}
