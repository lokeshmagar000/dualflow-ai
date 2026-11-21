"use client";
/**
 * Light / Dark / System buttons. The choice is saved in this browser (localStorage)
 * and read again by the small script in layout.tsx on every visit.
 */
import { useEffect, useState } from "react";
import { IconDesktop, IconMoon, IconSun } from "./icons";

type Choice = "light" | "dark" | "system";

function apply(choice: Choice) {
  const dark = choice === "dark" || (choice === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
}

export function ThemeSwitch() {
  const [choice, setChoice] = useState<Choice>("system");
  useEffect(() => {
    try {
      setChoice((localStorage.getItem("df-theme") as Choice) || "system");
    } catch {
      /* private window: just keep "system" */
    }
  }, []);
  // When "System" is picked, follow the phone/computer setting even if it changes later (e.g. at night).
  useEffect(() => {
    if (choice !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => apply("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [choice]);

  function pick(c: Choice) {
    setChoice(c);
    try { localStorage.setItem("df-theme", c); } catch { /* ignore */ }
    apply(c);
  }

  const opts: { c: Choice; label: string; Icon: typeof IconSun }[] = [
    { c: "light", label: "Light", Icon: IconSun },
    { c: "dark", label: "Dark", Icon: IconMoon },
    { c: "system", label: "System", Icon: IconDesktop },
  ];
  return (
    <div role="radiogroup" aria-label="Theme" className="flex rounded-md bg-subtle2 p-0.5">
      {opts.map(({ c, label, Icon }) => (
        <button key={c} role="radio" aria-checked={choice === c} onClick={() => pick(c)} title={label}
          className={`flex h-8 flex-1 items-center justify-center gap-1 rounded text-xs ${choice === c ? "bg-surface font-semibold text-fg1 shadow-card" : "text-fg3 hover:text-fg1"}`}>
          <Icon className="h-4 w-4" /> {label}
        </button>
      ))}
    </div>
  );
}
