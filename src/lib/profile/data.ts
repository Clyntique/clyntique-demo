import "server-only";
import { prisma } from "@/lib/prisma";
import type { Role } from "@/generated/prisma/enums";

export interface FullProfile {
  id: string; // userId
  name: string;
  email: string;
  role: Role;
  createdAt: Date;
  isPolicyAdmin?: boolean;
  avatarUrl: string | null;
  firstName: string;
  lastName: string;
  phone: string;
  city: string;
  state: string;
  country: string;
  timezone: string;
  preferredLanguage: string;
  jobTitle: string;
  companyName: string;
  department: string;
  bio: string;
}

/**
 * Loads a user's full profile details.
 * Additive fallback: if no UserProfile record exists yet, derives defaults from User
 * so existing accounts work without any manual database migrations or seed scripts.
 */
export async function getFullProfile(userId: string): Promise<FullProfile | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      createdAt: true,
      isPolicyAdmin: true,
      profile: true,
    },
  });

  if (!user) return null;

  const nameParts = user.name.trim().split(/\s+/);
  const derivedFirst = nameParts[0] || "";
  const derivedLast = nameParts.slice(1).join(" ") || "";

  const p = user.profile;

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    createdAt: user.createdAt,
    isPolicyAdmin: user.isPolicyAdmin,
    avatarUrl: p?.avatarUrl ?? null,
    firstName: p?.firstName ?? derivedFirst,
    lastName: p?.lastName ?? derivedLast,
    phone: p?.phone ?? "",
    city: p?.city ?? "",
    state: p?.state ?? "",
    country: p?.country ?? "",
    timezone: p?.timezone || "UTC",
    preferredLanguage: p?.preferredLanguage || "en-US",
    jobTitle: p?.jobTitle ?? "",
    companyName: p?.companyName ?? "",
    department: p?.department ?? "",
    bio: p?.bio ?? "",
  };
}
