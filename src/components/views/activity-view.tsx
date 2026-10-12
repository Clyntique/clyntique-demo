import type { Role } from "@/generated/prisma/enums";
import { requireRole } from "@/lib/auth/dal";
import { getActivity } from "@/lib/data/workspace";
import { requestTime } from "@/lib/format";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { ActivityIcon } from "@/components/ui/icons";
import { EmptyState } from "@/components/ui/states";
import { ActivityTimeline } from "@/components/workspace/activity-feed";

export async function ActivityView({ role }: { role: Role }) {
  const user = await requireRole(role);
  const items = await getActivity(user, { take: 100 });
  const now = requestTime();

  return (
    <>
      <PageHeader
        title="Activity"
        description={
          role === "TEAM"
            ? "Submissions, reviews and decisions across every client, newest first."
            : "What has happened on your submissions, newest first."
        }
      />
      {items.length ? (
        <Card className="max-w-3xl p-5 sm:p-6">
          <ActivityTimeline items={items} now={now} />
        </Card>
      ) : (
        <EmptyState icon={<ActivityIcon />} title="No activity yet." />
      )}
    </>
  );
}
