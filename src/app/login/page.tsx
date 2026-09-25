import { redirect } from "next/navigation";
import { isSignedIn } from "@/lib/auth";
import { LoginForm } from "./LoginForm";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (await isSignedIn()) redirect("/");
  return (
    <main className="login-wrap">
      <h1 className="wordmark">Watchlist</h1>
      <LoginForm />
    </main>
  );
}
