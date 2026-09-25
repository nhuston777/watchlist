"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { findExisting, metadataFields, toSummary } from "@/lib/items";
import { isListKey, isMediaKind } from "@/lib/labels";
import { getRatings } from "@/lib/omdb";
import { getDetails } from "@/lib/tmdb";
import type { ItemSummary, ListKey, MediaKind } from "@/lib/types";

export type AddResult = { ok: true; item: ItemSummary } | { ok: false; duplicate?: ItemSummary; error?: string };

/** Adds a title as Want to watch. The (mediaType, tmdbId) unique constraint makes duplicates impossible. */
export async function addItem(mediaType: MediaKind, tmdbId: number, list: ListKey): Promise<AddResult> {
  await requireAuth();
  if (!isMediaKind(mediaType) || !Number.isInteger(tmdbId) || !isListKey(list)) return { ok: false, error: "Bad request" };

  const existing = await findExisting(mediaType, tmdbId);
  if (existing) return { ok: false, duplicate: existing };

  let fields;
  try {
    const details = await getDetails(mediaType, tmdbId);
    fields = metadataFields(details, await getRatings(details.imdbId));
  } catch (e) {
    console.error(e);
    return { ok: false, error: "Couldn't reach TMDB. Try again." };
  }

  try {
    const item = await prisma.item.create({ data: { mediaType, tmdbId, list, status: "WANT", ...fields } });
    revalidatePath("/");
    return { ok: true, item: toSummary(item) };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const dup = await findExisting(mediaType, tmdbId);
      if (dup) return { ok: false, duplicate: dup };
    }
    throw e;
  }
}

export async function removeItem(id: string): Promise<void> {
  await requireAuth();
  await prisma.item.deleteMany({ where: { id } });
  revalidatePath("/");
}

export async function moveItem(id: string, list: ListKey): Promise<ItemSummary | null> {
  await requireAuth();
  if (!isListKey(list)) return null;
  const item = await prisma.item.update({ where: { id }, data: { list } });
  revalidatePath("/");
  return toSummary(item);
}

/** "Want to watch again": back to Want, clearing watched/caught-up progress. */
export async function watchAgain(id: string): Promise<ItemSummary> {
  await requireAuth();
  const item = await prisma.item.update({
    where: { id },
    data: { status: "WANT", watchedAt: null, caughtUpSeason: null },
  });
  revalidatePath("/");
  return toSummary(item);
}
