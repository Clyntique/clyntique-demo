"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/dal";
import { prisma } from "@/lib/prisma";
import { formatContextWithReviewTier, type ReviewTier } from "@/lib/plans/review-tier";

export async function updateReviewTierAction(
  creativeId: string,
  tier: ReviewTier
): Promise<{ ok: boolean; tier?: ReviewTier; error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Please sign in again." };

  try {
    const creative = await prisma.creative.findUnique({
      where: { id: creativeId },
      select: { id: true, context: true, createdById: true, project: { select: { client: { select: { id: true } } } } },
    });

    if (!creative) return { ok: false, error: "Creative not found." };

    // Clients may only update their own creatives; team members can update any creative
    if (user.role === "CLIENT" && creative.createdById !== user.id && creative.project.client.id !== user.id) {
      return { ok: false, error: "You don't have permission to modify this creative." };
    }

    const updatedContext = formatContextWithReviewTier(creative.context, tier);

    await prisma.creative.update({
      where: { id: creativeId },
      data: { context: updatedContext },
    });

    revalidatePath("/dashboard/creatives/[creativeId]", "page");
    revalidatePath("/admin/creatives/[creativeId]", "page");
    revalidatePath("/dashboard", "layout");
    revalidatePath("/admin", "layout");

    return { ok: true, tier };
  } catch (error) {
    console.error("Failed to update review tier:", error);
    return { ok: false, error: "Failed to update review tier preference." };
  }
}
