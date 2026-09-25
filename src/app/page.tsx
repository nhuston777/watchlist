import { requireAuth } from "@/lib/auth";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";

export const dynamic = "force-dynamic";

export default async function Home() {
  await requireAuth();
  return (
    <>
      <Header />
      <main className="main">
        <div className="search-bar">
          <input className="input search-input" type="search" placeholder="Search movies and shows" autoFocus disabled />
        </div>
        <p className="empty">Nothing here yet. Search and lists arrive in the next milestones.</p>
      </main>
      <Footer />
    </>
  );
}
