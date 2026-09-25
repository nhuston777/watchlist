import Link from "next/link";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { LIST_LABEL, STATUS_LABEL } from "@/lib/labels";
import { getDetails } from "@/lib/tmdb";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { ReviewQueue, type Guess, type ReviewRow } from "./ReviewQueue";

export const dynamic = "force-dynamic";

export default async function ReviewPage() {
  await requireAuth();
  const [candidates, items] = await Promise.all([
    prisma.reviewCandidate.findMany({ where: { state: "PENDING" }, orderBy: { createdAt: "asc" } }),
    prisma.item.findMany({ select: { mediaType: true, tmdbId: true, list: true, status: true } }),
  ]);

  // Where each title already lives, so a guess can say "Already on Me · Watching".
  const onLists: Record<string, string> = {};
  for (const i of items) onLists[`${i.mediaType}:${i.tmdbId}`] = `${LIST_LABEL[i.list]} · ${STATUS_LABEL[i.status]}`;

  const rows: ReviewRow[] = await Promise.all(
    candidates.map(async (c) => {
      let guess: Guess | null = null;
      if (c.mediaType && c.tmdbId) {
        const d = await getDetails(c.mediaType, c.tmdbId).catch(() => null);
        guess = d
          ? { mediaType: d.mediaType, tmdbId: d.tmdbId, title: d.title, year: d.year, posterPath: d.posterPath }
          : { mediaType: c.mediaType, tmdbId: c.tmdbId, title: `TMDB #${c.tmdbId}`, year: null, posterPath: null };
      }
      return {
        id: c.id,
        rawText: c.rawText,
        source: c.source,
        reason: c.reason,
        suggestedList: c.suggestedList ?? "ME",
        suggestedStatus: c.suggestedStatus ?? "WANT",
        guess,
      };
    }),
  );

  return (
    <>
      <Header />
      <main className="main">
        <Link href="/" className="back-link">
          ← Watchlist
        </Link>
        <h1 className="page-title">Needs review</h1>
        <p className="help">
          Leftovers from the Notion import: loose notes, conflicting duplicates and links TMDB couldn&apos;t resolve. Accept puts the
          title on the list and status you pick (moving it if it&apos;s already on a list).
        </p>
        <ReviewQueue rows={rows} onLists={onLists} />
      </main>
      <Footer />
    </>
  );
}
