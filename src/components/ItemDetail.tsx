"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { moveItem, refreshMetadata, removeItem, setStatus, updateNote } from "@/app/actions/items";
import { Poster } from "@/components/Poster";
import { metaLine, shortDate } from "@/lib/format";
import { LIST_LABEL, LISTS, STATUS_LABEL } from "@/lib/labels";
import { hasNewSeason, MOVIE_STATUSES, TV_STATUSES } from "@/lib/progress";
import type { ItemView } from "@/lib/types";
import { RatingBadge } from "./RatingBadge";

/** Everything about one title: shared by the detail sheet and the full /item/[id] page. */
export function ItemDetail({ item, seasons, onClose }: { item: ItemView; seasons?: ReactNode; onClose: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [note, setNote] = useState(item.note ?? "");
  const [noteSaved, setNoteSaved] = useState(true);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const statuses = item.mediaType === "TV" ? TV_STATUSES : MOVIE_STATUSES;
  const newSeason = hasNewSeason(item);

  const run = (fn: () => Promise<unknown>) =>
    startTransition(async () => {
      setMessage(null);
      await fn();
    });

  return (
    <article className="detail">
      <div className="detail-hero">
        <Poster path={item.posterPath} title={item.title} size="w500" className="detail-poster" />
        <div className="detail-heading">
          <h1 className="detail-title">{item.title}</h1>
          <p className="preview-meta">{metaLine(item)}</p>
          <div className="detail-ratings">
            <RatingBadge rtScore={item.rtScore} imdbRating={item.rtScore !== null ? null : item.imdbRating} />
            {item.rtScore !== null && item.imdbRating !== null && <RatingBadge rtScore={null} imdbRating={item.imdbRating} />}
          </div>
          {item.genres.length > 0 && <p className="detail-genres">{item.genres.join(" · ")}</p>}
          {newSeason && <span className="pill accent">New season</span>}
        </div>
      </div>

      {item.overview && <p className="detail-overview">{item.overview}</p>}

      <section className="detail-section">
        <h2 className="section-label">Status</h2>
        <div className="seg-buttons" role="group" aria-label="Status">
          {statuses.map((s) => (
            <button
              key={s}
              type="button"
              className={`seg-btn ${item.status === s ? "active" : ""}`}
              aria-pressed={item.status === s}
              disabled={pending}
              onClick={() => run(() => setStatus(item.id, s))}
            >
              {STATUS_LABEL[s]}
            </button>
          ))}
        </div>
        {item.mediaType === "TV" && item.seasonCount !== null && (
          <p className="help">
            {item.status === "CAUGHT_UP" && item.caughtUpSeason !== null
              ? `Caught up through season ${item.caughtUpSeason}.`
              : `Caught up records season ${item.seasonCount}, so you'll see "New season" when the next one arrives.`}
            {newSeason && (
              <>
                {" "}
                <button type="button" className="link-btn" disabled={pending} onClick={() => run(() => setStatus(item.id, "CAUGHT_UP"))}>
                  Mark caught up on season {item.seasonCount}
                </button>
              </>
            )}
          </p>
        )}
        <p className="help">
          Added {shortDate(item.addedAt, true)}
          {item.watchedAt && item.status === "WATCHED" ? ` · Watched ${shortDate(item.watchedAt, true)}` : ""}
        </p>
      </section>

      <section className="detail-section">
        <h2 className="section-label">List</h2>
        <div className="seg-buttons" role="group" aria-label="List">
          {LISTS.map((l) => (
            <button
              key={l}
              type="button"
              className={`seg-btn ${item.list === l ? "active" : ""}`}
              aria-pressed={item.list === l}
              disabled={pending || item.list === l}
              onClick={() => run(() => moveItem(item.id, l))}
            >
              {LIST_LABEL[l]}
            </button>
          ))}
        </div>
      </section>

      {seasons}

      <section className="detail-section">
        <label htmlFor={`note-${item.id}`} className="section-label">
          Note
        </label>
        <textarea
          id={`note-${item.id}`}
          className="input note"
          rows={2}
          placeholder="Who recommended it, where to stream it…"
          value={note}
          onChange={(e) => {
            setNote(e.target.value);
            setNoteSaved(false);
          }}
          onBlur={() => {
            if (noteSaved) return;
            run(async () => {
              await updateNote(item.id, note);
              setNoteSaved(true);
            });
          }}
        />
        {!noteSaved && <p className="help">Saves when you leave the field.</p>}
      </section>

      <section className="detail-section detail-footer">
        <button
          type="button"
          className="btn small"
          disabled={pending}
          onClick={() =>
            run(async () => {
              const res = await refreshMetadata(item.id);
              setMessage(res.ok ? "Updated from TMDB and OMDb." : (res.error ?? "Refresh failed."));
            })
          }
        >
          Refresh metadata
        </button>
        {confirmRemove ? (
          <span className="confirm">
            <span>Remove {item.title}?</span>
            <button
              type="button"
              className="btn small danger"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  await removeItem(item.id);
                  onClose();
                  router.refresh();
                })
              }
            >
              Remove
            </button>
            <button type="button" className="btn small ghost" onClick={() => setConfirmRemove(false)}>
              Cancel
            </button>
          </span>
        ) : (
          <button type="button" className="btn small ghost danger-text" onClick={() => setConfirmRemove(true)}>
            Remove…
          </button>
        )}
      </section>
      {message && <p className="help">{message}</p>}
      <p className="help dim">Metadata updated {shortDate(item.metadataAt, true)}</p>
    </article>
  );
}
