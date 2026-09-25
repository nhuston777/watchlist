import Link from "next/link";
import { logout } from "@/app/actions/auth";
import { prisma } from "@/lib/db";

export async function Header() {
  const pending = await prisma.reviewCandidate.count({ where: { state: "PENDING" } });
  return (
    <header className="header">
      <Link href="/" className="wordmark">
        Watchlist
      </Link>
      <div className="header-actions">
        {pending > 0 && (
          <Link href="/review" className="review-badge">
            Needs review <span className="count-badge">{pending}</span>
          </Link>
        )}
        <form action={logout}>
          <button type="submit" className="btn ghost small">
            Sign out
          </button>
        </form>
      </div>
    </header>
  );
}
