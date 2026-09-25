import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { scryptSync, timingSafeEqual } from "crypto";
import { SESSION_COOKIE, SESSION_MAX_AGE_SECONDS, createSessionToken, isValidSessionToken } from "./session";

/** Checks a passcode against APP_PASSCODE_HASH ("salt:hash", both hex; see scripts/hash-passcode.mjs). */
export function verifyPasscode(passcode: string): boolean {
  const stored = process.env.APP_PASSCODE_HASH;
  if (!stored) throw new Error("APP_PASSCODE_HASH environment variable is not set");
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const candidate = scryptSync(passcode.normalize(), salt, 64);
  const expected = Buffer.from(hash, "hex");
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

export async function createSession(): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, createSessionToken(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

export async function isSignedIn(): Promise<boolean> {
  const store = await cookies();
  return isValidSessionToken(store.get(SESSION_COOKIE)?.value);
}

/** Call at the top of every page and server action; the proxy alone isn't enough. */
export async function requireAuth(): Promise<void> {
  if (!(await isSignedIn())) redirect("/login");
}
