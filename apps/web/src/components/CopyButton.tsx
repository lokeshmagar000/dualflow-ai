"use client";
/**
 * A small "Copy" button: puts the text on your clipboard, so you can paste the
 * title, description or hashtags straight into YouTube, Facebook, Instagram or TikTok.
 */
import { useState } from "react";

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Older browsers or no permission: the text is still on the page to select by hand.
    }
  }
  return (
    <button type="button" onClick={copy}
      className="shrink-0 rounded-md border border-zinc-300 px-2 py-0.5 text-xs text-zinc-600 hover:bg-zinc-100">
      {copied ? "Copied ✓" : label}
    </button>
  );
}
