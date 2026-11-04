import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("Phase 1: Theme System & Dashboard Shell (PR A)", () => {
  it("globals.css defines dark theme variables and light theme isolation", () => {
    const css = readFileSync("src/app/globals.css", "utf8");

    // Dark mode palette overrides
    expect(css).toContain(".dark {");
    expect(css).toContain("--color-canvas: #090d16;");
    expect(css).toContain("--color-surface: #0f172a;");
    expect(css).toContain("--color-subtle: #1e293b;");
    expect(css).toContain("--color-line: #1e293b;");
    expect(css).toContain("--color-ink: #f8fafc;");
    expect(css).toContain("--color-positive-soft:");
    expect(css).toContain("--color-attention-soft:");
    expect(css).toContain("--color-critical-soft:");

    // Light mode isolation class (for /demo and explicit light views)
    expect(css).toContain(".theme-light {");
    expect(css).toContain("--color-canvas: #f8f9fa;");
    expect(css).toContain("--color-surface: #ffffff;");
  });

  it("layout.tsx includes zero-flash script and suppressHydrationWarning", () => {
    const layout = readFileSync("src/app/layout.tsx", "utf8");

    expect(layout).toContain("suppressHydrationWarning");
    expect(layout).toContain("<head>");
    expect(layout).toContain("localStorage.getItem('clyntique-theme')");
    expect(layout).toContain("prefers-color-scheme: dark");
    expect(layout).toContain("<ThemeProvider>");
  });

  it("ThemeProvider uses useSyncExternalStore for hydration-safe, cascade-free storage synchronization", () => {
    const provider = readFileSync("src/components/theme/theme-provider.tsx", "utf8");

    expect(provider).toContain('"use client"');
    expect(provider).toContain("useSyncExternalStore");
    expect(provider).toContain("clyntique-theme");
    expect(provider).toContain("export function useTheme()");
    expect(provider).toContain("export function ThemeProvider");
  });

  it("ThemeToggle provides accessible light, dark, and system options", () => {
    const toggle = readFileSync("src/components/theme/theme-toggle.tsx", "utf8");

    expect(toggle).toContain('"use client"');
    expect(toggle).toContain('role="menuitemradio"');
    expect(toggle).toContain("useTheme");
    expect(toggle).toContain("SunIcon");
    expect(toggle).toContain("MoonIcon");
    expect(toggle).toContain("MonitorIcon");
  });

  it("DashboardHeader renders dynamic breadcrumbs, search trigger, theme toggle, notification bell, and user menu", () => {
    const header = readFileSync("src/components/layout/dashboard-header.tsx", "utf8");

    expect(header).toContain('"use client"');
    expect(header).toContain("<DashboardBreadcrumbs");
    expect(header).toContain("<ThemeToggle");
    expect(header).toContain("<NotificationBell");
    expect(header).toContain("<UserMenu");
    expect(header).toContain("⌘");
    expect(header).toContain("Search or jump to...");
  });

  it("NotificationBell displays authentic empty state and links to activity without fabricated counts", () => {
    const bell = readFileSync("src/components/layout/notification-bell.tsx", "utf8");

    expect(bell).toContain('"use client"');
    expect(bell).toContain("0 unread");
    expect(bell).toContain("all caught up");
    expect(bell).toContain("View full activity log");
    expect(bell).toContain("/activity");
  });

  it("UserMenu displays user identity, role badge, profile link, and sign-out form", () => {
    const menu = readFileSync("src/components/layout/user-menu.tsx", "utf8");

    expect(menu).toContain('"use client"');
    expect(menu).toContain("{user.name}");
    expect(menu).toContain("{user.email}");
    expect(menu).toContain("/profile");
    expect(menu).toContain('action="/auth/logout"');
  });

  it("InteractiveYcDemo root container is isolated with theme-light", () => {
    const demo = readFileSync("src/components/demo/interactive-yc-demo.tsx", "utf8");

    expect(demo).toContain("theme-light");
  });
});
