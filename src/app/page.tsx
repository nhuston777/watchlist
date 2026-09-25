import { requireAuth } from "@/lib/auth";
import { getAllItems } from "@/lib/items";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { ListBrowser } from "./ListBrowser";
import { SearchPanel } from "./SearchPanel";

export const dynamic = "force-dynamic";

export default async function Home() {
  await requireAuth();
  const items = await getAllItems();
  return (
    <>
      <Header />
      <main className="main">
        <SearchPanel index={items}>
          <ListBrowser items={items} />
        </SearchPanel>
      </main>
      <Footer />
    </>
  );
}
