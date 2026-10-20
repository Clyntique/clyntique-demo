import type { Metadata } from "next";
import { Suspense } from "react";
import { MessagesView } from "@/components/views/messages-view";
import { PageSkeleton } from "@/components/views/page-skeleton";

export const metadata: Metadata = { title: "Messages · Clyntique" };

export default function TeamMessagesPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <MessagesView role="TEAM" />
    </Suspense>
  );
}
