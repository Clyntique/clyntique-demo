import type { Metadata } from "next";
import { Suspense } from "react";
import { MessagesView } from "@/components/views/messages-view";
import { PageSkeleton } from "@/components/views/page-skeleton";

export const metadata: Metadata = { title: "Messages · Clyntique" };

export default function ClientConversationPage({ params }: PageProps<"/dashboard/messages/[conversationId]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ConversationContent params={params} />
    </Suspense>
  );
}

async function ConversationContent({ params }: { params: Promise<{ conversationId: string }> }) {
  const { conversationId } = await params;
  return <MessagesView role="CLIENT" conversationId={conversationId} />;
}
