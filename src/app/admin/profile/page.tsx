import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/dal";
import { getFullProfile } from "@/lib/profile/data";
import { ProfileEditor } from "@/components/profile/profile-editor";
import { PageSkeleton } from "@/components/views/page-skeleton";

export const metadata: Metadata = { title: "Team Profile · Clyntique" };

async function TeamProfileContent() {
  const user = await requireRole("TEAM");
  const profile = await getFullProfile(user.id);
  if (!profile) notFound();

  return (
    <div className="space-y-6">
      <div className="border-b border-line pb-4">
        <h1 className="text-xl font-bold tracking-tight text-ink sm:text-2xl">
          Team Reviewer Profile
        </h1>
        <p className="mt-1 text-small text-muted">
          Manage your reviewer identity, notification preferences, and account security.
        </p>
      </div>

      <ProfileEditor initialProfile={profile} demoSession={user.demoSession} />
    </div>
  );
}

export default function TeamProfilePage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <TeamProfileContent />
    </Suspense>
  );
}
