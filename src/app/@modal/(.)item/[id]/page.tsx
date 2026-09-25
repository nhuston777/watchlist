import { isSignedIn } from "@/lib/auth";
import { loadItem } from "@/lib/load-item";
import { ItemSheet } from "@/components/ItemDetailView";

export const dynamic = "force-dynamic";

/** /item/[id] opened from the list: shown as a sheet over home. */
export default async function ItemSheetPage({ params }: PageProps<"/item/[id]">) {
  if (!(await isSignedIn())) return null;
  const { id } = await params;
  const loaded = await loadItem(id);
  // Removed while open: render nothing and let the sheet close.
  if (!loaded) return null;
  return <ItemSheet item={loaded.item} seasons={loaded.seasons} />;
}
