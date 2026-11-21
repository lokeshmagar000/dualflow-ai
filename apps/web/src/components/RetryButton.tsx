"use client";
/** "Try again": asks the server for this page's data again, without a full reload. */
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { IconRefresh } from "./icons";

export function RetryButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button className="btn btn-primary" disabled={pending} onClick={() => start(() => router.refresh())}>
      <IconRefresh className={`h-4 w-4 ${pending ? "animate-spin" : ""}`} />
      {pending ? "Trying…" : "Try again"}
    </button>
  );
}
