import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { metaLine, shortDate } from "@/lib/format";
import { LIST_LABEL, STATUS_LABEL } from "@/lib/labels";
import { Poster } from "@/components/Poster";
import { RatingBadge } from "@/components/RatingBadge";

export const dynamic = "force-dynamic";

export default async function ItemPage({ params }: PageProps<"/item/[id]">) {
  await requireAuth();
  const { id } = await params;
  const item = await prisma.item.findUnique({ where: { id } });
  if (!item) notFound();

  return (
    <main className="main item-page">
      <Link href="/" className="back-link">
        ← Back
      </Link>
      <div className="preview-card">
        <Poster path={item.posterPath} title={item.title} size="w342" className="preview-poster" />
        <div className="preview-body">
          <h1 className="preview-title">{item.title}</h1>
          <p className="preview-meta">{metaLine(item)}</p>
          <RatingBadge rtScore={item.rtScore} imdbRating={item.imdbRating} />
          <p className="dup-text">
            On <strong>{LIST_LABEL[item.list]}</strong> · {STATUS_LABEL[item.status]}
            <span className="dim"> (added {shortDate(item.addedAt, true)})</span>
          </p>
          {item.overview && <p className="preview-overview">{item.overview}</p>}
        </div>
      </div>
    </main>
  );
}
