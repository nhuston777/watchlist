import { Suspense } from "react";
import { prisma } from "@/lib/db";
import { toView } from "@/lib/items";
import { Seasons, SeasonsSkeleton } from "@/components/Seasons";

/** Loads an item for the sheet or the page; the season list streams in separately. */
export async function loadItem(id: string) {
  const item = await prisma.item.findUnique({ where: { id } });
  if (!item) return null;
  const seasons =
    item.mediaType === "TV" ? (
      <Suspense fallback={<SeasonsSkeleton />}>
        <Seasons tmdbId={item.tmdbId} caughtUpSeason={item.caughtUpSeason} />
      </Suspense>
    ) : undefined;
  return { item: toView(item), seasons };
}
