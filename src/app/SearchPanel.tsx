"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { addItem, moveItem, removeItem, watchAgain } from "@/app/actions/items";
import { Poster } from "@/components/Poster";
import { RatingBadge } from "@/components/RatingBadge";
import { matchesLocal, parseQuery } from "@/lib/detect";
import { metaLine, shortDate } from "@/lib/format";
import { LIST_LABEL, LISTS, MEDIA_LABEL, STATUS_LABEL } from "@/lib/labels";
import type { SearchResponse } from "@/lib/search";
import type { ItemSummary, ListKey, MediaKind, Ratings, SearchResult, TitleDetails } from "@/lib/types";

type Key = `${MediaKind}:${number}`;
const keyOf = (x: { mediaType: MediaKind; tmdbId: number }): Key => `${x.mediaType}:${x.tmdbId}`;

interface Preview {
  details: TitleDetails;
  ratings: Ratings;
  existing: ItemSummary | null;
}

type Loadable<T> = { state: "loading" } | { state: "error"; message: string } | { state: "done"; data: T };

interface Toast {
  id: number;
  message: string;
  undo?: () => void;
}

const LAST_LIST_KEY = "watchlist:lastList";

function onListLabel(item: ItemSummary): string {
  return `${LIST_LABEL[item.list]} · ${STATUS_LABEL[item.status]}`;
}

export function SearchPanel({ index }: { index: ItemSummary[] }) {
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState<(Loadable<SearchResponse> & { q: string }) | null>(null);
  const [selected, setSelected] = useState<Key | null>(null);
  const [previews, setPreviews] = useState<Record<Key, Loadable<Preview>>>({});
  // Local changes made in this session (added / moved / removed), layered over the server index
  // so the UI never waits on a refresh to know what's on a list.
  const [overrides, setOverrides] = useState<Record<Key, ItemSummary | null>>({});
  const [lastList, setLastList] = useState<ListKey | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      const v = localStorage.getItem(LAST_LIST_KEY);
      if (v === "ME" || v === "DOT_AND_ME" || v === "FAM") setLastList(v);
    } catch {}
  }, []);

  const byKey = useMemo(() => {
    const map = new Map<Key, ItemSummary>();
    for (const item of index) map.set(keyOf(item), item);
    for (const [k, v] of Object.entries(overrides) as [Key, ItemSummary | null][]) {
      if (v) map.set(k, v);
      else map.delete(k);
    }
    return map;
  }, [index, overrides]);

  const trimmed = query.trim();
  const parsed = useMemo(() => parseQuery(trimmed), [trimmed]);

  // 1. Instant local check: no network, so "is this already on a list?" is answered as you type.
  const localMatches = useMemo(() => {
    if (trimmed.length < 2) return [];
    const out: ItemSummary[] = [];
    for (const item of byKey.values()) {
      if (matchesLocal(item.title, trimmed) || (parsed.text !== parsed.raw && matchesLocal(item.title, parsed.text))) {
        if (!parsed.type || parsed.type === item.mediaType) out.push(item);
      }
    }
    return out.slice(0, 6);
  }, [byKey, trimmed, parsed]);

  // 2. TMDB results, debounced.
  useEffect(() => {
    if (trimmed.length < 2) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setSearch({ state: "loading", q: trimmed });
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(trimmed)}`, { signal: controller.signal });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Search failed.");
        setSearch({ state: "done", data, q: trimmed });
        setSelected(data.selected ? keyOf(data.selected) : null);
      } catch (e) {
        if (controller.signal.aborted) return;
        setSearch({ state: "error", message: e instanceof Error ? e.message : "Search failed.", q: trimmed });
      }
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [trimmed]);

  // 4. Preview for the selected result (skipped when it's already on a list: the alert needs no network).
  const loadPreview = useCallback(async (key: Key) => {
    setPreviews((p) => ({ ...p, [key]: { state: "loading" } }));
    const [type, id] = key.split(":");
    try {
      const res = await fetch(`/api/title/${type.toLowerCase()}/${id}`);
      const data = await res.json();
      if (data.existing) setOverrides((o) => ({ ...o, [key]: data.existing }));
      if (!res.ok) throw new Error(data.error ?? "Couldn't load this title.");
      setPreviews((p) => ({ ...p, [key]: { state: "done", data } }));
    } catch (e) {
      setPreviews((p) => ({ ...p, [key]: { state: "error", message: e instanceof Error ? e.message : "Couldn't load this title." } }));
    }
  }, []);

  useEffect(() => {
    if (!selected || byKey.has(selected) || previews[selected]) return;
    loadPreview(selected);
  }, [selected, byKey, previews, loadPreview]);

  const showToast = useCallback((message: string, undo?: () => void) => {
    setToast({ id: Date.now(), message, undo });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(t);
  }, [toast]);

  const clear = () => {
    setQuery("");
    setSearch(null);
    setSelected(null);
    inputRef.current?.focus();
  };

  const active = trimmed.length >= 2;
  const response = active && search?.state === "done" && search.q === trimmed ? search.data : null;
  const results = response?.results ?? [];
  const chooser = response?.chooser ?? null;
  const selectedResult = selected ? results.find((r) => keyOf(r) === selected) : undefined;
  const selectedExisting = selected ? byKey.get(selected) : undefined;
  const searching = active && (search?.q !== trimmed || search.state === "loading");

  return (
    <div className="search">
      <div className="search-bar">
        <form
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            inputRef.current?.blur();
          }}
        >
          <input
            ref={inputRef}
            className="input search-input"
            type="search"
            placeholder="Search movies and shows"
            aria-label="Search movies and shows"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && clear()}
            autoFocus
            autoComplete="off"
            autoCorrect="off"
            enterKeyHint="search"
          />
          {query && (
            <button type="button" className="search-clear" onClick={clear} aria-label="Clear search">
              ×
            </button>
          )}
        </form>
      </div>

      {active && localMatches.length > 0 && (
        <section className="search-section">
          <h2 className="section-label">Already on your lists</h2>
          <ul className="result-list">
            {localMatches.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  className={`result-row ${selected === keyOf(item) ? "selected" : ""}`}
                  onClick={() => setSelected(keyOf(item))}
                >
                  <Poster path={item.posterPath} title={item.title} size="w92" className="thumb" />
                  <span className="result-text">
                    <span className="result-title">{item.title}</span>
                    <span className="result-meta">
                      {MEDIA_LABEL[item.mediaType]}
                      {item.year ? ` · ${item.year}` : ""}
                    </span>
                  </span>
                  <span className="on-list-badge">{onListLabel(item)}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {chooser && (
        <div className="chooser" role="group" aria-label="Movie or show?">
          {[chooser.movie, chooser.show].map((r) => (
            <button
              key={keyOf(r)}
              type="button"
              className={`chip-btn ${selected === keyOf(r) ? "active" : ""}`}
              onClick={() => setSelected(keyOf(r))}
            >
              {r.mediaType === "MOVIE" ? "The movie" : "The show"}
              {r.year ? ` (${r.year}${r.mediaType === "TV" ? "–" : ""})` : ""}
            </button>
          ))}
        </div>
      )}

      {active && selected && (selectedExisting || selectedResult) && (
        <section className="search-section" aria-live="polite">
          {selectedExisting ? (
            <DuplicateAlert
              item={selectedExisting}
              onChange={(item) => setOverrides((o) => ({ ...o, [keyOf(item)]: item }))}
              showToast={showToast}
            />
          ) : (
            <PreviewCard
              result={selectedResult!}
              preview={previews[selected]}
              lastList={lastList}
              onRetry={() => loadPreview(selected)}
              onAdded={(item) => {
                const k = keyOf(item);
                setOverrides((o) => ({ ...o, [k]: item }));
                setLastList(item.list);
                try {
                  localStorage.setItem(LAST_LIST_KEY, item.list);
                } catch {}
                showToast(`Added to ${LIST_LABEL[item.list]}`, async () => {
                  setOverrides((o) => ({ ...o, [k]: null }));
                  setToast(null);
                  await removeItem(item.id);
                });
              }}
              onDuplicate={(item) => setOverrides((o) => ({ ...o, [keyOf(item)]: item }))}
            />
          )}
        </section>
      )}

      {active && (
        <section className="search-section">
          {results.length > 0 && <h2 className="section-label">{searching ? "Searching…" : "Results"}</h2>}
          {searching && results.length === 0 && <ResultSkeleton />}
          {search?.state === "error" && search.q === trimmed && <p className="notice">{search.message}</p>}
          {response && results.length === 0 && localMatches.length === 0 && <p className="notice">No matches on TMDB.</p>}
          <ul className={`result-list ${searching ? "stale" : ""}`}>
            {results.map((r) => (
              <ResultRow key={keyOf(r)} result={r} existing={byKey.get(keyOf(r))} selected={selected === keyOf(r)} onSelect={() => setSelected(keyOf(r))} />
            ))}
          </ul>
        </section>
      )}

      {toast && (
        <div className="toast" role="status" key={toast.id}>
          <span>{toast.message}</span>
          {toast.undo && (
            <button type="button" className="toast-action" onClick={toast.undo}>
              Undo
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function ResultRow({ result, existing, selected, onSelect }: { result: SearchResult; existing?: ItemSummary; selected: boolean; onSelect: () => void }) {
  return (
    <li>
      <button type="button" className={`result-row ${selected ? "selected" : ""}`} onClick={onSelect} aria-pressed={selected}>
        <Poster path={result.posterPath} title={result.title} size="w92" className="thumb" />
        <span className="result-text">
          <span className="result-title">{result.title}</span>
          <span className="result-meta">
            <span className={`type-badge ${result.mediaType === "TV" ? "tv" : ""}`}>{MEDIA_LABEL[result.mediaType]}</span>
            {result.year ?? ""}
          </span>
        </span>
        {existing && <span className="on-list-badge">On {onListLabel(existing)}</span>}
      </button>
    </li>
  );
}

function ResultSkeleton() {
  return (
    <ul className="result-list" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <li key={i} className="result-row skeleton-row">
          <div className="poster thumb shimmer" />
          <span className="result-text">
            <span className="skeleton-line shimmer" style={{ width: "60%" }} />
            <span className="skeleton-line shimmer" style={{ width: "30%" }} />
          </span>
        </li>
      ))}
    </ul>
  );
}

function PreviewCard({
  result,
  preview,
  lastList,
  onRetry,
  onAdded,
  onDuplicate,
}: {
  result: SearchResult;
  preview: Loadable<Preview> | undefined;
  lastList: ListKey | null;
  onRetry: () => void;
  onAdded: (item: ItemSummary) => void;
  onDuplicate: (item: ItemSummary) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!preview || preview.state === "loading") {
    return (
      <div className="preview-card">
        <Poster path={result.posterPath} title={result.title} size="w342" className="preview-poster" />
        <div className="preview-body">
          <h3 className="preview-title">{result.title}</h3>
          <p className="preview-meta">
            {MEDIA_LABEL[result.mediaType]}
            {result.year ? ` · ${result.year}` : ""}
          </p>
          <span className="skeleton-line shimmer" style={{ width: "40%" }} />
          <span className="skeleton-line shimmer" />
          <span className="skeleton-line shimmer" />
          <span className="skeleton-line shimmer" style={{ width: "70%" }} />
        </div>
      </div>
    );
  }
  if (preview.state === "error") {
    return (
      <div className="preview-card">
        <div className="preview-body">
          <p className="notice">{preview.message}</p>
          <button type="button" className="btn small" onClick={onRetry}>
            Try again
          </button>
        </div>
      </div>
    );
  }

  const { details, ratings } = preview.data;
  const add = (list: ListKey) =>
    startTransition(async () => {
      setError(null);
      const res = await addItem(details.mediaType, details.tmdbId, list);
      if (res.ok) onAdded(res.item);
      else if (res.duplicate) onDuplicate(res.duplicate);
      else setError(res.error ?? "Couldn't add it.");
    });

  return (
    <div className="preview-card">
      <Poster path={details.posterPath} title={details.title} size="w342" className="preview-poster" />
      <div className="preview-body">
        <h3 className="preview-title">{details.title}</h3>
        <p className="preview-meta">{metaLine(details)}</p>
        <RatingBadge rtScore={ratings.rtScore} imdbRating={ratings.imdbRating} />
        {details.overview && <p className="preview-overview">{details.overview}</p>}
        <div className="add-row">
          <span className="add-label">Add to</span>
          <div className="add-buttons">
            {LISTS.map((list) => (
              <button key={list} type="button" className={`btn ${list === lastList ? "primary" : ""}`} disabled={pending} onClick={() => add(list)}>
                {LIST_LABEL[list]}
              </button>
            ))}
          </div>
        </div>
        {error && <p className="form-error">{error}</p>}
      </div>
    </div>
  );
}

function DuplicateAlert({
  item,
  onChange,
  showToast,
}: {
  item: ItemSummary;
  onChange: (item: ItemSummary) => void;
  showToast: (message: string) => void;
}) {
  const [moving, setMoving] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <div className="dup-alert" role="alert">
      <Poster path={item.posterPath} title={item.title} size="w185" className="dup-poster" />
      <div className="dup-body">
        <h3 className="preview-title">{item.title}</h3>
        <p className="dup-text">
          Already on <strong>{LIST_LABEL[item.list]}</strong> · {STATUS_LABEL[item.status]}
          <span className="dim"> (added {shortDate(item.addedAt)})</span>
        </p>
        <div className="dup-actions">
          <Link className="btn small" href={`/item/${item.id}`}>
            Open
          </Link>
          <button type="button" className="btn small" onClick={() => setMoving((m) => !m)} aria-expanded={moving}>
            Move to…
          </button>
          {item.status === "WATCHED" && (
            <button
              type="button"
              className="btn small"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  onChange(await watchAgain(item.id));
                  showToast("Back on Want to watch");
                })
              }
            >
              Want to watch again
            </button>
          )}
        </div>
        {moving && (
          <div className="dup-actions">
            {LISTS.filter((l) => l !== item.list).map((list) => (
              <button
                key={list}
                type="button"
                className="btn small primary"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    const moved = await moveItem(item.id, list);
                    if (moved) {
                      onChange(moved);
                      showToast(`Moved to ${LIST_LABEL[list]}`);
                    }
                    setMoving(false);
                  })
                }
              >
                {LIST_LABEL[list]}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
