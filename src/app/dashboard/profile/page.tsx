import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/dal";
import { getFullProfile } from "@/lib/profile/data";
import { ProfileEditor } from "@/components/profile/profile-editor";
import { PageSkeleton } from "@/components/views/page-skeleton";

export const metadata: Metadata = { title: "Profile · Clyntique" };

async function ClientProfileContent() {
  const user = await requireRole("CLIENT");
  const profile = await getFullProfile(user.id);
  if (!profile) notFound();

  return (
    <div className="space-y-6">
      <div className="border-b border-line pb-4">
        <h1 className="text-xl font-bold tracking-tight text-ink sm:text-2xl">
          Account Profile
        </h1>
        <p className="mt-1 text-small text-muted">
          Manage your personal details, workspace credentials, and security settings.
        </p>
      </div>

      <ProfileEditor initialProfile={profile} demoSession={user.demoSession} />
    </div>
  );
}

export default function ClientProfilePage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ClientProfileContent />
    </Suspense>
  );
}
