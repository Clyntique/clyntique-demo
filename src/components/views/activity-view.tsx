import type { Role } from "@/generated/prisma/enums";
import { requireRole } from "@/lib/auth/dal";
import { getDemoSnapshot } from "@/lib/demo-data";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { ActivityIcon } from "@/components/ui/icons";
import { EmptyState } from "@/components/ui/states";
import { ActivityTimeline } from "@/components/workspace/activity-feed";
import { DemoDataNotice } from "@/components/workspace/demo-notice";

export async function ActivityView({ role }: { role: Role }) {
  await requireRole(role);
  const { now, activity: items } = getDemoSnapshot(role);

  return (
    <>
      <PageHeader
        title="Activity"
        description={
          role === "TEAM"
            ? "Uploads, feedback, and approvals across all projects."
            : "The latest progress on your projects."
        }
      />
      {items.length ? (
        <Card className="max-w-3xl p-6">
          <ActivityTimeline items={items} now={now} />
        </Card>
      ) : (
        <EmptyState icon={<ActivityIcon />} title="No activity yet." />
      )}
      <DemoDataNotice />
    </>
  );
}
