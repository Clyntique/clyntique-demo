"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/dal";
import { prisma } from "@/lib/prisma";
import { hashPassword, verifyPassword } from "@/lib/auth/password";

export type ProfileActionResult = {
  ok: boolean;
  message?: string;
  error?: string;
};

function revalidateAll() {
  revalidatePath("/admin", "layout");
  revalidatePath("/dashboard", "layout");
}

/**
 * Updates editable profile information for the authenticated user.
 * Strictly scoped to session.userId. Does not allow changing role, email,
 * policy-admin status, or other users' profiles.
 */
export async function updateProfileAction(
  _prev: ProfileActionResult | undefined,
  formData: FormData
): Promise<ProfileActionResult> {
  const user = await getCurrentUser();
  if (!user) {
    return { ok: false, error: "Your session has ended. Please sign in again." };
  }

  const firstName = String(formData.get("firstName") ?? "").trim().slice(0, 50);
  const lastName = String(formData.get("lastName") ?? "").trim().slice(0, 50);
  const phone = String(formData.get("phone") ?? "").trim().slice(0, 30);
  const city = String(formData.get("city") ?? "").trim().slice(0, 100);
  const state = String(formData.get("state") ?? "").trim().slice(0, 100);
  const country = String(formData.get("country") ?? "").trim().slice(0, 100);
  const timezone = String(formData.get("timezone") ?? "").trim().slice(0, 50) || "UTC";
  const preferredLanguage = String(formData.get("preferredLanguage") ?? "").trim().slice(0, 20) || "en-US";
  const jobTitle = String(formData.get("jobTitle") ?? "").trim().slice(0, 100);
  const companyName = String(formData.get("companyName") ?? "").trim().slice(0, 100);
  const department = String(formData.get("department") ?? "").trim().slice(0, 100);
  const bio = String(formData.get("bio") ?? "").trim().slice(0, 500);

  // Sync display name if first/last name changed
  const updatedDisplayName = [firstName, lastName].filter(Boolean).join(" ");
  if (updatedDisplayName && updatedDisplayName !== user.name) {
    await prisma.user.update({
      where: { id: user.id },
      data: { name: updatedDisplayName },
    });
  }

  // Upsert profile record
  await prisma.userProfile.upsert({
    where: { userId: user.id },
    create: {
      userId: user.id,
      firstName: firstName || null,
      lastName: lastName || null,
      phone: phone || null,
      city: city || null,
      state: state || null,
      country: country || null,
      timezone,
      preferredLanguage,
      jobTitle: jobTitle || null,
      companyName: companyName || null,
      department: department || null,
      bio: bio || null,
    },
    update: {
      firstName: firstName || null,
      lastName: lastName || null,
      phone: phone || null,
      city: city || null,
      state: state || null,
      country: country || null,
      timezone,
      preferredLanguage,
      jobTitle: jobTitle || null,
      companyName: companyName || null,
      department: department || null,
      bio: bio || null,
    },
  });

  revalidateAll();
  return { ok: true, message: "Profile updated successfully." };
}

/**
 * Changes password for the authenticated user, requiring current password verification.
 * Rejects demo logins, validates minimum length (8 chars), and prevents password reuse.
 */
export async function changePasswordAction(
  _prev: ProfileActionResult | undefined,
  formData: FormData
): Promise<ProfileActionResult> {
  const user = await getCurrentUser();
  if (!user) {
    return { ok: false, error: "Your session has ended. Please sign in again." };
  }

  if (user.demoSession) {
    return { ok: false, error: "Password changes are disabled for quick-login demo accounts." };
  }

  const currentPassword = String(formData.get("currentPassword") ?? "");
  const newPassword = String(formData.get("newPassword") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  if (!currentPassword) {
    return { ok: false, error: "Current password is required." };
  }
  if (!newPassword) {
    return { ok: false, error: "New password is required." };
  }
  if (newPassword.length < 8) {
    return { ok: false, error: "New password must be at least 8 characters long." };
  }
  if (newPassword.length > 100) {
    return { ok: false, error: "New password must not exceed 100 characters." };
  }
  if (newPassword !== confirmPassword) {
    return { ok: false, error: "New passwords do not match." };
  }

  const account = await prisma.user.findUnique({
    where: { id: user.id },
    select: { passwordHash: true },
  });

  if (!account) {
    return { ok: false, error: "Account could not be found." };
  }

  const isCurrentValid = await verifyPassword(currentPassword, account.passwordHash);
  if (!isCurrentValid) {
    return { ok: false, error: "Current password is incorrect." };
  }

  const isSame = await verifyPassword(newPassword, account.passwordHash);
  if (isSame) {
    return { ok: false, error: "New password must be different from current password." };
  }

  const newHash = await hashPassword(newPassword);
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: newHash },
  });

  revalidateAll();
  return { ok: true, message: "Password updated successfully." };
}
