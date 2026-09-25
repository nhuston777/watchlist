import { logout } from "@/app/actions/auth";

export function Header() {
  return (
    <header className="header">
      <span className="wordmark">Watchlist</span>
      <form action={logout}>
        <button type="submit" className="btn ghost small">
          Sign out
        </button>
      </form>
    </header>
  );
}
