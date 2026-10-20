import type { Metadata } from "next";
import { Suspense } from "react";
import { NewMessageView } from "@/components/views/messages-view";
import { PageSkeleton } from "@/components/views/page-skeleton";

export const metadata: Metadata = { title: "New message · Clyntique" };

export default function NewMessagePage({ searchParams }: PageProps<"/dashboard/messages/new">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <NewMessageContent searchParams={searchParams} />
    </Suspense>
  );
}

async function NewMessageContent({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { about } = await searchParams;
  return <NewMessageView about={typeof about === "string" ? about : undefined} />;
}
