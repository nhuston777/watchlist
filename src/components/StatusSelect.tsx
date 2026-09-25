"use client";

import { useOptimistic, useTransition } from "react";
import { setStatus } from "@/app/actions/items";
import { STATUS_LABEL } from "@/lib/labels";
import { MOVIE_STATUSES, TV_STATUSES } from "@/lib/progress";
import type { MediaKind, StatusKey } from "@/lib/types";

/** Compact status picker for list rows. Movies: Want / Watched. Shows add Watching and Caught up. */
export function StatusSelect({ id, mediaType, status }: { id: string; mediaType: MediaKind; status: StatusKey }) {
  const [optimistic, setOptimistic] = useOptimistic(status);
  const [pending, startTransition] = useTransition();
  const options = mediaType === "TV" ? TV_STATUSES : MOVIE_STATUSES;
  return (
    <label className={`status-select status-${optimistic.toLowerCase()} ${pending ? "pending" : ""}`}>
      <span className="visually-hidden">Status</span>
      <select
        value={optimistic}
        onChange={(e) => {
          const next = e.target.value as StatusKey;
          startTransition(async () => {
            setOptimistic(next);
            await setStatus(id, next);
          });
        }}
      >
        {options.map((s) => (
          <option key={s} value={s}>
            {STATUS_LABEL[s]}
          </option>
        ))}
      </select>
    </label>
  );
}
