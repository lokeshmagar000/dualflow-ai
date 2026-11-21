"use client";
/**
 * The app frame: the menu on the left (big screens) or behind the ☰ button (phones and tablets).
 * Pages are grouped by what you want to do: make videos, upload them, track how it goes.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  IconChart, IconClock, IconDismiss, IconDownload, IconHome, IconImages, IconMenu, IconMoney,
  IconPeople, IconSettings, IconSignOut, IconSparkle, IconUpload, IconVideo,
} from "./icons";
import { ThemeSwitch } from "./ThemeSwitch";

type Item = { href: string; label: string; icon: (p: { className?: string }) => React.ReactElement };
const GROUPS: { title?: string; items: Item[] }[] = [
  { items: [{ href: "/", label: "Home", icon: IconHome }] },
  {
    title: "Make videos",
    items: [
      { href: "/ideas", label: "Ideas & auto mode", icon: IconSparkle },
      { href: "/content", label: "All videos", icon: IconVideo },
      { href: "/library", label: "Media library", icon: IconImages },
    ],
  },
  {
    title: "Upload",
    items: [
      { href: "/ready", label: "Ready to upload", icon: IconDownload },
      { href: "/calendar", label: "Upload queue", icon: IconClock },
      { href: "/bulk-upload", label: "Bulk upload", icon: IconUpload },
      { href: "/channels", label: "Channels", icon: IconPeople },
    ],
  },
  {
    title: "Track",
    items: [
      { href: "/analytics", label: "Analytics", icon: IconChart },
      { href: "/costs", label: "Costs & limits", icon: IconMoney },
    ],
  },
];
const SETTINGS: Item = { href: "/settings", label: "Settings", icon: IconSettings };
const ALL: Item[] = [...GROUPS.flatMap((g) => g.items), SETTINGS];

function isActive(href: string, path: string) {
  return href === "/" ? path === "/" : path === href || path.startsWith(`${href}/`);
}

export function Sidebar({ logout }: { logout: () => Promise<void> }) {
  const path = usePathname();
  const [open, setOpen] = useState(false); // phone menu open?
  // Instant feedback: the menu item you click shows a small spinner until its page has arrived.
  const [opening, setOpening] = useState<string | null>(null);
  useEffect(() => {
    setOpening(null); // the new page is here: hide the spinner
    setOpen(false); // and close the phone menu
  }, [path]);
  // The Esc key closes the phone menu.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const current = ALL.find((i) => isActive(i.href, path));

  const nav = (
    <div className="flex h-full flex-col">
      <Link href="/" className="flex items-center gap-2.5 px-4 pb-4 pt-4">
        <Logo />
        <span className="leading-tight">
          <span className="block text-[15px] font-semibold text-fg1">DualFlow AI</span>
          <span className="block text-xs text-fg3">नेपाली + English studio</span>
        </span>
      </Link>
      <nav aria-label="Main menu" className="flex-1 overflow-y-auto px-2 pb-2">
        {GROUPS.map((g, i) => (
          <div key={i} className={g.title ? "mt-4" : ""}>
            {g.title && <p className="px-3 pb-1 text-xs font-semibold text-fg3">{g.title}</p>}
            <ul className="space-y-0.5">
              {g.items.map((item) => (
                <NavLink key={item.href} item={item} active={isActive(item.href, path)}
                  loading={opening === item.href} onPick={() => !isActive(item.href, path) && setOpening(item.href)} />
              ))}
            </ul>
          </div>
        ))}
      </nav>
      <div className="space-y-0.5 border-t border-stroke px-2 py-2">
        <ul>
          <NavLink item={SETTINGS} active={isActive("/settings", path)} loading={opening === "/settings"}
            onPick={() => !isActive("/settings", path) && setOpening("/settings")} />
        </ul>
        <form action={logout}>
          <button className="flex h-10 w-full items-center gap-3 rounded-md px-3 text-left text-fg2 hover:bg-hover">
            <IconSignOut className="text-fg3" /> Sign out
          </button>
        </form>
        <div className="px-1 pt-2"><ThemeSwitch /></div>
      </div>
    </div>
  );

  return (
    <>
      {/* Big screens: the menu is always there. */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 lg:block">{nav}</aside>

      {/* Phones and tablets: a top bar with the ☰ button and the page name. */}
      <header className="sticky top-0 z-30 flex h-12 items-center gap-1 border-b border-stroke bg-mica/95 px-2 backdrop-blur lg:hidden">
        <button onClick={() => setOpen(true)} aria-label="Open menu" aria-expanded={open}
          className="flex h-10 w-10 items-center justify-center rounded-md text-fg1 hover:bg-hover">
          <IconMenu />
        </button>
        <Link href="/" aria-label="Home" className="flex h-10 items-center pr-1"><Logo size={24} /></Link>
        <span className="truncate font-semibold">{current?.label ?? "DualFlow AI"}</span>
        {opening && <Spinner className="ml-auto mr-2" />}
      </header>

      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          {/* The dark area behind the menu: tap it to close. */}
          <button aria-label="Close menu" className="absolute inset-0 h-full w-full bg-black/40" onClick={() => setOpen(false)} />
          <aside className="df-drawer absolute inset-y-0 left-0 w-[min(18rem,85vw)] bg-mica shadow-flyout">
            <button onClick={() => setOpen(false)} aria-label="Close menu"
              className="absolute right-2 top-3 z-10 flex h-10 w-10 items-center justify-center rounded-md text-fg2 hover:bg-hover">
              <IconDismiss />
            </button>
            {nav}
          </aside>
        </div>
      )}
    </>
  );
}

function NavLink({ item, active, loading, onPick }: { item: Item; active: boolean; loading: boolean; onPick: () => void }) {
  const Icon = item.icon;
  return (
    <li>
      <Link href={item.href} onClick={onPick} aria-current={active ? "page" : undefined}
        className={`relative flex h-10 items-center gap-3 rounded-md px-3 ${active ? "bg-surface font-semibold text-fg1 shadow-card" : "text-fg2 hover:bg-hover"}`}>
        {/* Fluent's small blue bar shows which page you are on. */}
        {active && <span className="absolute left-0 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-full bg-brand" />}
        <Icon className={active ? "text-brand-fg" : "text-fg3"} />
        <span className="flex-1 truncate">{item.label}</span>
        {loading && <Spinner />}
      </Link>
    </li>
  );
}

function Spinner({ className = "" }: { className?: string }) {
  return (
    <span aria-label="Loading" role="status"
      className={`inline-block h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-stroke-strong border-t-brand ${className}`} />
  );
}

/** The Namaste Facts palm-bulb logo; a lighter version is used in dark mode. */
export function Logo({ size = 32 }: { size?: number }) {
  return (
    <>
      <img src="/logo-light.svg" alt="" width={size} height={size} className="dark:hidden" />
      <img src="/logo-dark.svg" alt="" width={size} height={size} className="hidden dark:block" />
    </>
  );
}
