import { requireAuth } from "@/lib/auth";
import { getIndex } from "@/lib/items";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { SearchPanel } from "./SearchPanel";

export const dynamic = "force-dynamic";

export default async function Home() {
  await requireAuth();
  const index = await getIndex();
  return (
    <>
      <Header />
      <main className="main">
        <SearchPanel index={index} />
      </main>
      <Footer />
    </>
  );
}
