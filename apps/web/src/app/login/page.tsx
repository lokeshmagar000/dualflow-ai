"use client";
import { useActionState } from "react";
import { login, type LoginState } from "./actions";

export default function LoginPage() {
  // useActionState runs the server action and keeps its result (e.g. an error).
  const [state, formAction, pending] = useActionState(login, {} as LoginState);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-4">
      <form action={formAction} className="card w-full max-w-sm space-y-4 p-6 sm:p-8">
        <div className="flex items-center gap-3">
          <img src="/logo-light.svg" alt="" width={44} height={44} className="dark:hidden" />
          <img src="/logo-dark.svg" alt="" width={44} height={44} className="hidden dark:block" />
          <div>
            <h1 className="text-xl font-semibold">DualFlow AI</h1>
            <p className="text-fg3">नेपाली + English video studio</p>
          </div>
        </div>
        <label className="block">
          <span className="mb-1 block font-semibold">Email</span>
          <input name="email" type="email" required autoComplete="email" defaultValue={state.email ?? ""} key={state.email ?? ""} className="field" />
        </label>
        <label className="block">
          <span className="mb-1 block font-semibold">Password</span>
          <input name="password" type="password" required autoComplete="current-password" className="field" />
        </label>
        {state.error && <p role="alert" className="text-bad">{state.error}</p>}
        <button disabled={pending} className="btn btn-primary w-full">
          {pending ? "Signing in…" : "Sign in"}
        </button>
      </form>
      {/* Public links: TikTok, Google and Meta reviewers open the site and look for these. */}
      <p className="max-w-sm text-center text-sm text-fg3">
        Private tool that makes Namaste Facts videos and posts them to the owner&apos;s own channels.{" "}
        <a href="/terms" className="underline">Terms of service</a> · <a href="/privacy" className="underline">Privacy policy</a>
      </p>
    </main>
  );
}
