"use client";
import { useActionState } from "react";
import { login, type LoginState } from "./actions";

export default function LoginPage() {
  // useActionState runs the server action and keeps its result (e.g. an error).
  const [state, formAction, pending] = useActionState(login, {} as LoginState);

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <form action={formAction} className="w-full max-w-sm space-y-4 rounded-2xl bg-white p-8 shadow-sm ring-1 ring-zinc-200">
        <div>
          <h1 className="text-2xl font-bold">DualFlow AI</h1>
          <p className="text-sm text-zinc-500">नेपाली + English video studio</p>
        </div>
        <label className="block">
          <span className="text-sm font-medium">Email</span>
          <input name="email" type="email" required autoComplete="email"
            className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 outline-none focus:border-brand-500" />
        </label>
        <label className="block">
          <span className="text-sm font-medium">Password</span>
          <input name="password" type="password" required autoComplete="current-password"
            className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 outline-none focus:border-brand-500" />
        </label>
        {state.error && <p className="text-sm text-red-600">{state.error}</p>}
        <button disabled={pending}
          className="w-full rounded-lg bg-brand-500 py-2 font-medium text-white hover:bg-brand-600 disabled:opacity-60">
          {pending ? "Signing in..." : "Sign in"}
        </button>
      </form>
    </main>
  );
}
