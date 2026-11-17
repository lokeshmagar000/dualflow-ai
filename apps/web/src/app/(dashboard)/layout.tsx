import { Sidebar } from "@/components/Sidebar";
import { logout } from "../login/actions";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <Sidebar logout={logout} />
      <main className="flex-1 p-4 md:p-8">{children}</main>
    </div>
  );
}
