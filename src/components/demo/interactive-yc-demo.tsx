"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { DEMO_CLIENTS, type DemoRole } from "@/lib/demo/data";
import { parseDemoRole, parseDemoView, type DemoView } from "@/lib/demo/links";
import { messagesFor, reviewQueue } from "@/lib/demo/store";
import { DemoProvider, useDemo } from "./demo-provider";
import { DemoBanner, DemoHeader, DemoNav, navItemsFor } from "./demo-shell";
import { DemoRoleChooser } from "./role-chooser";
import { SubmissionDetail } from "./submission-detail";
import { ClientMessages, ClientOverview, ClientProjects, SubmissionsList, TeamMessages, TeamPolicies, TeamQueue } from "./workspace-views";

/*
 * The public /demo sandbox. Three roles share one in-memory store so a
 * reviewer can act as Client 1, Client 2 and Team in turn and watch the same
 * fictional submissions move through review. Role and screen live in the
 * query string (?as=&view=&id=) so links, refresh and the back button work.
 */
export function InteractiveYcDemo() {
  const params = useSearchParams();
  const role = parseDemoRole(params.get("as"));
  const view = role ? parseDemoView(params.get("view"), role) : undefined;
  const id = params.get("id");

  return (
    <DemoProvider>
      <Sandbox role={role} view={view} id={id} />
    </DemoProvider>
  );
}

function Sandbox({ role, view, id }: { role: DemoRole | null; view: DemoView | undefined; id: string | null }) {
  const { state, reset } = useDemo();
  const router = useRouter();

  const onReset = () => {
    reset();
    router.push("/demo");
  };

  return (
    <div className="min-h-screen bg-canvas text-ink flex flex-col antialiased">
      <DemoBanner onReset={onReset} />
      <DemoHeader role={role} view={view} id={id} />
      {!role || !view ? (
        <DemoRoleChooser />
      ) : (
        <main className="flex-1 mx-auto max-w-7xl w-full px-4 py-6 sm:px-6 lg:px-8">
          <div className="flex flex-col lg:flex-row gap-6">
            <DemoNav
              role={role}
              active={view}
              items={navItemsFor(role, {
                queue: reviewQueue(state).filter((s) => s.status === "SUBMITTED").length,
                messages: role === "team" ? 0 : messagesFor(state, role).length,
              })}
            />
            <section className="min-w-0 flex-1" aria-live="polite">
              <Screen role={role} view={view} id={id} />
            </section>
          </div>
        </main>
      )}
      <footer className="border-t border-line px-4 py-4 text-center text-caption text-muted">
        Demo data is fictional: {DEMO_CLIENTS.client1.organization}, {DEMO_CLIENTS.client2.organization} and every person named here are invented. Nothing you do here is saved beyond this browser tab.
      </footer>
    </div>
  );
}

function Screen({ role, view, id }: { role: DemoRole; view: DemoView; id: string | null }) {
  if (view === "submission") return <SubmissionDetail role={role} id={id} />;
  if (view === "submissions") return <SubmissionsList role={role} />;
  if (role === "team") {
    if (view === "messages") return <TeamMessages selected={id} />;
    if (view === "policies") return <TeamPolicies />;
    return <TeamQueue />;
  }
  if (view === "projects") return <ClientProjects role={role} />;
  if (view === "messages") return <ClientMessages role={role} />;
  return <ClientOverview role={role} />;
}
