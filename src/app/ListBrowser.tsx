"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Poster } from "@/components/Poster";
import { RatingBadge } from "@/components/RatingBadge";
import { StatusSelect } from "@/components/StatusSelect";
import { normalizeTitle } from "@/lib/detect";
import { metaLine } from "@/lib/format";
import { LIST_LABEL, LISTS } from "@/lib/labels";
import { hasNewSeason } from "@/lib/progress";
import type { ItemView, ListKey, MediaKind } from "@/lib/types";

type TypeFilter = "ALL" | MediaKind;
type Segment = "WANT" | "WATCHING" | "WATCHED";
type SortKey = "newest" | "rating" | "title" | "year";
type ViewMode = "rows" | "grid";

interface Prefs {
  list: ListKey;
  type: TypeFilter;
  segment: Segment;
  sort: SortKey;
  view: ViewMode;
}

const DEFAULT_PREFS: Prefs = { list: "ME", type: "ALL", segment: "WANT", sort: "newest", view: "rows" };
const PREFS_KEY = "watchlist:prefs";

const SEGMENTS: { key: Segment; label: string }[] = [
  { key: "WANT", label: "Want to watch" },
  { key: "WATCHING", label: "Watching" },
  { key: "WATCHED", label: "Watched" },
];

const SORTS: { key: SortKey; label: string }[] = [
  { key: "newest", label: "Newest" },
  { key: "rating", label: "RT score" },
  { key: "title", label: "Title" },
  { key: "year", label: "Year" },
];

function segmentOf(item: ItemView): Segment {
  if (item.status === "WATCHING" || item.status === "CAUGHT_UP") return "WATCHING";
  return item.status;
}

/** RT first; IMDb (×10) only breaks ties among titles without an RT score. */
function ratingKey(item: ItemView): number {
  if (item.rtScore !== null) return 1000 + item.rtScore;
  if (item.imdbRating !== null) return item.imdbRating * 10;
  return -1;
}

function compare(sort: SortKey): (a: ItemView, b: ItemView) => number {
  switch (sort) {
    case "rating":
      return (a, b) => ratingKey(b) - ratingKey(a);
    case "title":
      return (a, b) => normalizeTitle(a.title).localeCompare(normalizeTitle(b.title));
    case "year":
      return (a, b) => (b.year ?? 0) - (a.year ?? 0);
    default:
      return (a, b) => b.addedAt.localeCompare(a.addedAt);
  }
}

export function ListBrowser({ items }: { items: ItemView[] }) {
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  const [ready, setReady] = useState(false);

  // Per-device preferences live in localStorage, which only exists after hydration.
  useEffect(() => {
    let saved: Partial<Prefs> = {};
    try {
      saved = JSON.parse(localStorage.getItem(PREFS_KEY) ?? "{}");
    } catch {}
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time sync from localStorage after mount
    setPrefs((p) => ({ ...p, ...saved }));
    setReady(true);
  }, []);

  const update = (patch: Partial<Prefs>) => {
    setPrefs((p) => {
      const next = { ...p, ...patch };
      if (next.type === "MOVIE" && next.segment === "WATCHING") next.segment = "WANT";
      try {
        localStorage.setItem(PREFS_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  const inList = useMemo(
    () => items.filter((i) => i.list === prefs.list && (prefs.type === "ALL" || i.mediaType === prefs.type)),
    [items, prefs.list, prefs.type],
  );

  const counts = useMemo(() => {
    const c: Record<Segment, number> = { WANT: 0, WATCHING: 0, WATCHED: 0 };
    for (const i of inList) c[segmentOf(i)]++;
    return c;
  }, [inList]);

  const newSeasonCount = useMemo(() => items.filter((i) => i.list === prefs.list && hasNewSeason(i)).length, [items, prefs.list]);

  const shown = useMemo(() => {
    const cmp = compare(prefs.sort);
    // Shows with a new season float to the top, whatever the sort.
    return inList
      .filter((i) => segmentOf(i) === prefs.segment)
      .sort((a, b) => Number(hasNewSeason(b)) - Number(hasNewSeason(a)) || cmp(a, b));
  }, [inList, prefs.segment, prefs.sort]);

  const segments = prefs.type === "MOVIE" ? SEGMENTS.filter((s) => s.key !== "WATCHING") : SEGMENTS;

  return (
    <section className={`browser ${ready ? "" : "not-ready"}`} aria-label="Lists">
      <div className="list-controls">
        <div className="list-tabs" role="tablist" aria-label="List">
          {LISTS.map((list) => (
            <button
              key={list}
              type="button"
              role="tab"
              aria-selected={prefs.list === list}
              className={`list-tab ${prefs.list === list ? "active" : ""}`}
              onClick={() => update({ list })}
            >
              {LIST_LABEL[list]}
              {list === prefs.list && newSeasonCount > 0 && <span className="dot" aria-label={`${newSeasonCount} new seasons`} />}
            </button>
          ))}
        </div>

        <div className="filter-row">
          <div className="chips" role="group" aria-label="Type">
            {(
              [
                ["ALL", "All"],
                ["MOVIE", "Movies"],
                ["TV", "Shows"],
              ] as [TypeFilter, string][]
            ).map(([key, label]) => (
              <button key={key} type="button" className={`chip ${prefs.type === key ? "active" : ""}`} aria-pressed={prefs.type === key} onClick={() => update({ type: key })}>
                {label}
              </button>
            ))}
          </div>
          <div className="view-tools">
            <label className="sort-select">
              <span className="visually-hidden">Sort by</span>
              <select value={prefs.sort} onChange={(e) => update({ sort: e.target.value as SortKey })}>
                {SORTS.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="icon-btn"
              onClick={() => update({ view: prefs.view === "rows" ? "grid" : "rows" })}
              aria-label={prefs.view === "rows" ? "Show as poster grid" : "Show as rows"}
              title={prefs.view === "rows" ? "Poster grid" : "Rows"}
            >
              {prefs.view === "rows" ? <GridIcon /> : <RowsIcon />}
            </button>
          </div>
        </div>

        <div className="segments" role="tablist" aria-label="Status">
          {segments.map((s) => (
            <button
              key={s.key}
              type="button"
              role="tab"
              aria-selected={prefs.segment === s.key}
              className={`segment ${prefs.segment === s.key ? "active" : ""}`}
              onClick={() => update({ segment: s.key })}
            >
              {s.label}
              <span className="count">{counts[s.key]}</span>
            </button>
          ))}
        </div>
      </div>

      {shown.length === 0 ? (
        <p className="empty">Nothing here yet.</p>
      ) : prefs.view === "rows" ? (
        <ul className="rows">
          {shown.map((item) => (
            <RowCard key={item.id} item={item} />
          ))}
        </ul>
      ) : (
        <ul className="grid">
          {shown.map((item) => (
            <GridCard key={item.id} item={item} />
          ))}
        </ul>
      )}
    </section>
  );
}

function Pills({ item }: { item: ItemView }) {
  if (hasNewSeason(item)) return <span className="pill accent">New season</span>;
  if (item.status === "CAUGHT_UP") return <span className="pill">Caught up</span>;
  return null;
}

function RowCard({ item }: { item: ItemView }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <li className="row-card">
      <Link href={`/item/${item.id}`} className="row-poster" aria-label={`Open ${item.title}`}>
        <Poster path={item.posterPath} title={item.title} size="w185" />
      </Link>
      <div className="row-body">
        <Link href={`/item/${item.id}`} className="row-title">
          {item.title}
        </Link>
        <p className="row-meta">{metaLine(item)}</p>
        <div className="row-badges">
          <RatingBadge rtScore={item.rtScore} imdbRating={item.imdbRating} />
          <Pills item={item} />
        </div>
        {item.overview && (
          <button type="button" className={`synopsis ${expanded ? "expanded" : ""}`} onClick={() => setExpanded((e) => !e)} aria-expanded={expanded}>
            {item.overview}
          </button>
        )}
        <div className="row-actions">
          <StatusSelect id={item.id} mediaType={item.mediaType} status={item.status} />
        </div>
      </div>
    </li>
  );
}

function GridCard({ item }: { item: ItemView }) {
  return (
    <li className="grid-card">
      <Link href={`/item/${item.id}`} aria-label={item.title}>
        <div className="grid-poster">
          <Poster path={item.posterPath} title={item.title} size="w342" />
          <RatingBadge rtScore={item.rtScore} imdbRating={item.imdbRating} className="overlay" />
          {hasNewSeason(item) && <span className="pill accent overlay-pill">New season</span>}
        </div>
        <span className="grid-title">{item.title}</span>
      </Link>
    </li>
  );
}

function GridIcon() {
  return (
    <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true" fill="currentColor">
      <rect x="2" y="2" width="7" height="7" rx="1.5" />
      <rect x="11" y="2" width="7" height="7" rx="1.5" />
      <rect x="2" y="11" width="7" height="7" rx="1.5" />
      <rect x="11" y="11" width="7" height="7" rx="1.5" />
    </svg>
  );
}

function RowsIcon() {
  return (
    <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true" fill="currentColor">
      <rect x="2" y="3" width="5" height="6" rx="1" />
      <rect x="9" y="4" width="9" height="1.8" rx=".9" />
      <rect x="9" y="7" width="6" height="1.5" rx=".75" />
      <rect x="2" y="11" width="5" height="6" rx="1" />
      <rect x="9" y="12" width="9" height="1.8" rx=".9" />
      <rect x="9" y="15" width="6" height="1.5" rx=".75" />
    </svg>
  );
}
