import type { Role } from "@/generated/prisma/enums";

// Each role has its own shell under its own base path.
export function basePathFor(role: Role) {
  return role === "TEAM" ? "/admin" : "/dashboard";
}

export const ROLE_LABEL: Record<Role, string> = {
  TEAM: "Team",
  CLIENT: "Client",
};
