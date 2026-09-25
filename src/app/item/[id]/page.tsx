import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAuth } from "@/lib/auth";
import { loadItem } from "@/lib/load-item";
import { ItemPageView } from "@/components/ItemDetailView";

export const dynamic = "force-dynamic";

/** Direct link / refresh: the detail as a full page. */
export default async function ItemPage({ params }: PageProps<"/item/[id]">) {
  await requireAuth();
  const { id } = await params;
  const loaded = await loadItem(id);
  if (!loaded) notFound();
  return (
    <main className="main item-page">
      <Link href="/" className="back-link">
        ← Watchlist
      </Link>
      <ItemPageView item={loaded.item} seasons={loaded.seasons} />
    </main>
  );
}
