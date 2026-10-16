import { AppShell } from "@/components/layout/app-shell";
import { AutoRefresh } from "@/components/layout/auto-refresh";

// TEAM only. Access is enforced by requireRole("TEAM") in the shell and every page.
export default function TeamLayout({ children }: LayoutProps<"/admin">) {
  return (
    <AppShell role="TEAM">
      {children}
      <AutoRefresh />
    </AppShell>
  );
}
