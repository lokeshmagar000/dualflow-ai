import { Sidebar } from "@/components/Sidebar";
import { logout } from "../login/actions";

/**
 * Every dashboard page sits inside this frame: the menu, plus the content "layer"
 * (on big screens it has a rounded top-left corner, like Windows 11 apps).
 */
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen lg:flex">
      <Sidebar logout={logout} />
      <main className="min-w-0 flex-1 lg:pt-2">
        <div className="min-h-screen bg-layer lg:rounded-tl-lg lg:border-l lg:border-t lg:border-stroke">
          <div className="mx-auto w-full max-w-6xl px-4 py-5 sm:px-6 lg:px-8 lg:py-7">{children}</div>
        </div>
      </main>
    </div>
  );
}
