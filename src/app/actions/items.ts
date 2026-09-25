"use server";

import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { createItem, findExisting, isDuplicateError, metadataFields, statusFields, toSummary } from "@/lib/items";
import { isListKey, isMediaKind } from "@/lib/labels";
import { getRatings } from "@/lib/omdb";
import { getDetails } from "@/lib/tmdb";
import { MOVIE_STATUSES, TV_STATUSES } from "@/lib/progress";
import type { ItemSummary, ListKey, MediaKind, StatusKey } from "@/lib/types";

/** Refresh everything under the root layout, including the detail sheet slot. */
function refresh() {
  revalidatePath("/", "layout");
}

export type AddResult = { ok: true; item: ItemSummary } | { ok: false; duplicate?: ItemSummary; error?: string };

/** Adds a title as Want to watch. The (mediaType, tmdbId) unique constraint makes duplicates impossible. */
export async function addItem(mediaType: MediaKind, tmdbId: number, list: ListKey): Promise<AddResult> {
  await requireAuth();
  if (!isMediaKind(mediaType) || !Number.isInteger(tmdbId) || !isListKey(list)) return { ok: false, error: "Bad request" };

  const existing = await findExisting(mediaType, tmdbId);
  if (existing) return { ok: false, duplicate: existing };

  try {
    const item = await createItem({ mediaType, tmdbId, list });
    refresh();
    return { ok: true, item: toSummary(item) };
  } catch (e) {
    if (isDuplicateError(e)) {
      const dup = await findExisting(mediaType, tmdbId);
      if (dup) return { ok: false, duplicate: dup };
    }
    console.error(e);
    return { ok: false, error: "Couldn't reach TMDB. Try again." };
  }
}

export async function removeItem(id: string): Promise<void> {
  await requireAuth();
  await prisma.item.deleteMany({ where: { id } });
  refresh();
}

export async function moveItem(id: string, list: ListKey): Promise<ItemSummary | null> {
  await requireAuth();
  if (!isListKey(list)) return null;
  const item = await prisma.item.update({ where: { id }, data: { list } });
  refresh();
  return toSummary(item);
}

/** "Want to watch again": back to Want, clearing watched/caught-up progress. */
export async function watchAgain(id: string): Promise<ItemSummary> {
  await requireAuth();
  const item = await prisma.item.update({
    where: { id },
    data: { status: "WANT", watchedAt: null, caughtUpSeason: null },
  });
  refresh();
  return toSummary(item);
}

/**
 * Status changes. Watched stamps watchedAt; Caught up records the season count at that moment
 * (that's what later makes "New season" appear); Want clears progress.
 */
export async function setStatus(id: string, status: StatusKey): Promise<ItemSummary | null> {
  await requireAuth();
  const item = await prisma.item.findUnique({ where: { id } });
  if (!item) return null;
  const allowed = item.mediaType === "TV" ? TV_STATUSES : MOVIE_STATUSES;
  if (!allowed.includes(status)) return null;
  const updated = await prisma.item.update({
    where: { id },
    data: statusFields(status, item.seasonCount, item),
  });
  refresh();
  return toSummary(updated);
}

export async function updateNote(id: string, note: string): Promise<void> {
  await requireAuth();
  const trimmed = note.trim().slice(0, 2000);
  await prisma.item.update({ where: { id }, data: { note: trimmed || null } });
  refresh();
}

/** Re-fetch TMDB details and OMDb ratings, bypassing caches. */
export async function refreshMetadata(id: string): Promise<{ ok: boolean; error?: string }> {
  await requireAuth();
  const item = await prisma.item.findUnique({ where: { id } });
  if (!item) return { ok: false, error: "Not found" };
  try {
    const details = await getDetails(item.mediaType, item.tmdbId, 0);
    const ratings = await getRatings(details.imdbId, 0);
    await prisma.item.update({ where: { id }, data: metadataFields(details, ratings) });
  } catch (e) {
    console.error(e);
    return { ok: false, error: "Couldn't reach TMDB. Try again." };
  }
  refresh();
  return { ok: true };
}
