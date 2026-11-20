"use client";
/**
 * Reloads the page's data every few seconds while something is still uploading,
 * so you see each platform's result without pressing refresh.
 * router.refresh() asks the server for fresh data but keeps what you typed in forms.
 */
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function AutoRefresh({ active, seconds = 15 }: { active: boolean; seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => router.refresh(), seconds * 1000);
    return () => clearInterval(timer); // stop when the page closes
  }, [active, seconds, router]);
  return null;
}
