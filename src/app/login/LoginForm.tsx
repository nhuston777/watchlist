"use client";

import { useActionState } from "react";
import { login, type LoginState } from "@/app/actions/auth";

export function LoginForm() {
  const [state, action, pending] = useActionState<LoginState, FormData>(login, {});
  return (
    <form action={action} className="login-form">
      <label htmlFor="passcode" className="visually-hidden">
        Passcode
      </label>
      <input
        id="passcode"
        name="passcode"
        type="password"
        className="input"
        placeholder="Passcode"
        autoComplete="current-password"
        autoFocus
        required
      />
      {state.error && <p className="form-error">{state.error}</p>}
      <button className="btn primary" type="submit" disabled={pending}>
        {pending ? "Checking…" : "Sign in"}
      </button>
    </form>
  );
}
