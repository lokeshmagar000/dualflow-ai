"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/", label: "Overview" },
  { href: "/ideas", label: "Ideas & Chat" },
  { href: "/content", label: "Content" },
  { href: "/editor", label: "Editor" },
  { href: "/library", label: "Media library" },
  { href: "/calendar", label: "Upload queue" },
  { href: "/channels", label: "Channels" },
  { href: "/analytics", label: "Analytics" },
  { href: "/costs", label: "Costs & Automation" },
  { href: "/settings", label: "Settings" },
];

export function Sidebar({ logout }: { logout: () => Promise<void> }) {
  const path = usePathname();
  return (
    <aside className="flex w-full flex-col border-b border-zinc-200 bg-white md:h-screen md:w-60 md:border-b-0 md:border-r">
      <div className="px-5 py-4">
        <p className="text-lg font-bold">DualFlow AI</p>
        <p className="text-xs text-zinc-500">नेपाली + English</p>
      </div>
      <nav className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-1 md:flex-col md:overflow-visible">
        {NAV.map((item) => {
          const active = item.href === "/" ? path === "/" : path.startsWith(item.href);
          return (
            <Link key={item.href} href={item.href}
              className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm ${active ? "bg-brand-500/10 font-semibold text-brand-600" : "text-zinc-600 hover:bg-zinc-100"}`}>
              {item.label}
            </Link>
          );
        })}
      </nav>
      <form action={logout} className="hidden p-3 md:block">
        <button className="w-full rounded-lg px-3 py-2 text-left text-sm text-zinc-500 hover:bg-zinc-100">Sign out</button>
      </form>
    </aside>
  );
}
