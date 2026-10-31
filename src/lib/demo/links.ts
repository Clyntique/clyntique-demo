import type { DemoRole } from "./data";

export type DemoView = "overview" | "projects" | "submissions" | "submission" | "messages" | "queue" | "policies";

export const DEMO_ROLES: DemoRole[] = ["client1", "client2", "team"];

export function parseDemoRole(value: string | null | undefined): DemoRole | null {
  return value === "client1" || value === "client2" || value === "team" ? value : null;
}

export function parseDemoView(value: string | null | undefined, role: DemoRole): DemoView {
  const views: DemoView[] =
    role === "team"
      ? ["queue", "submissions", "submission", "messages", "policies"]
      : ["overview", "projects", "submissions", "submission", "messages"];
  return views.includes(value as DemoView) ? (value as DemoView) : views[0];
}

/** Every demo screen is a query on /demo, so links, back and refresh all work. */
export function demoHref(role: DemoRole, view?: DemoView, id?: string | null): string {
  const params = new URLSearchParams({ as: role });
  if (view) params.set("view", view);
  if (id) params.set("id", id);
  return `/demo?${params.toString()}`;
}
