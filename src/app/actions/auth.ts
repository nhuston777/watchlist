"use server";

import { redirect } from "next/navigation";
import { createSession, destroySession, verifyPasscode } from "@/lib/auth";

export interface LoginState {
  error?: string;
}

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const passcode = String(formData.get("passcode") ?? "");
  if (!passcode || !verifyPasscode(passcode)) return { error: "Wrong passcode." };
  await createSession();
  redirect("/");
}

export async function logout(): Promise<void> {
  await destroySession();
  redirect("/login");
}
