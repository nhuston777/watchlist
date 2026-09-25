"use server";

import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { createItem, isDuplicateError, statusFields } from "@/lib/items";
import { isListKey, isMediaKind } from "@/lib/labels";
import { MOVIE_STATUSES, TV_STATUSES } from "@/lib/progress";
import type { ListKey, MediaKind, StatusKey } from "@/lib/types";

export interface AcceptChoice {
  mediaType: MediaKind;
  tmdbId: number;
  list: ListKey;
  status: StatusKey;
}

/**
 * Accept a review candidate: put the chosen title on the chosen list/status. If the title is
 * already in the database it's moved there (that's how a "duplicate in Notion" conflict is settled);
 * otherwise it's added.
 */
export async function acceptCandidate(id: string, choice: AcceptChoice): Promise<{ ok: boolean; error?: string }> {
  await requireAuth();
  const { mediaType, tmdbId, list, status } = choice;
  const statuses = mediaType === "TV" ? TV_STATUSES : MOVIE_STATUSES;
  if (!isMediaKind(mediaType) || !Number.isInteger(tmdbId) || !isListKey(list) || !statuses.includes(status)) {
    return { ok: false, error: "Bad request" };
  }
  const candidate = await prisma.reviewCandidate.findUnique({ where: { id } });
  if (!candidate || candidate.state !== "PENDING") return { ok: false, error: "Already handled." };

  const existing = await prisma.item.findUnique({ where: { mediaType_tmdbId: { mediaType, tmdbId } } });
  try {
    if (existing) {
      await prisma.item.update({ where: { id: existing.id }, data: { list, ...statusFields(status, existing.seasonCount, existing) } });
    } else {
      await createItem({ mediaType, tmdbId, list, status, importedFrom: candidate.source });
    }
  } catch (e) {
    if (!isDuplicateError(e)) {
      console.error(e);
      return { ok: false, error: "Couldn't reach TMDB. Try again." };
    }
  }
  await prisma.reviewCandidate.update({ where: { id }, data: { state: "ACCEPTED", mediaType, tmdbId } });
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function dismissCandidate(id: string): Promise<void> {
  await requireAuth();
  await prisma.reviewCandidate.updateMany({ where: { id, state: "PENDING" }, data: { state: "DISMISSED" } });
  revalidatePath("/", "layout");
}
