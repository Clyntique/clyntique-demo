import { AppShell } from "@/components/layout/app-shell";

// CLIENT only. Access is enforced by requireRole("CLIENT") in the shell and every page.
export default function ClientLayout({ children }: LayoutProps<"/dashboard">) {
  return <AppShell role="CLIENT">{children}</AppShell>;
}
