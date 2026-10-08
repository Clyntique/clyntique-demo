import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import type { Role } from "@/generated/prisma/enums";
import { basePathFor } from "@/lib/navigation";
import { getSession } from "./session";

// Data Access Layer: the authoritative auth/role check for protected pages
// and server actions. proxy.ts only does an optimistic early redirect.

export type CurrentUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
};

// Cached per request, so the layout and page share one database lookup.
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await getSession();
  if (!session) return null;
  // Never select passwordHash here: this object can reach the UI.
  return prisma.user.findUnique({
    where: { id: session.userId },
    select: { id: true, name: true, email: true, role: true },
  });
});

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login");
  return user;
}

// Users with a different role are sent to their own home.
export async function requireRole(role: Role): Promise<CurrentUser> {
  const user = await requireUser();
  if (user.role !== role) redirect(homePathFor(user.role));
  return user;
}

export function homePathFor(role: Role) {
  return basePathFor(role);
}
