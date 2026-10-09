"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/dal";
import { prisma } from "@/lib/prisma";

// TEAM-only mutations. Every action re-checks the role on the server, so
// hiding the UI from clients is not what protects these.

export type FormState =
  | {
      error?: string;
      fieldErrors?: Partial<Record<string, string>>;
      values?: Record<string, string>;
    }
  | undefined;

const NAME_MAX = 120;
const DESCRIPTION_MAX = 1000;

function text(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function revalidateWorkspaces() {
  revalidatePath("/admin", "layout");
  revalidatePath("/dashboard", "layout");
}

export async function createProject(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireRole("TEAM");

  const values = {
    name: text(formData, "name"),
    description: text(formData, "description"),
    clientId: text(formData, "clientId"),
  };
  const fieldErrors: Record<string, string> = {};

  if (values.name.length < 2) fieldErrors.name = "Enter a project name (at least 2 characters).";
  else if (values.name.length > NAME_MAX) fieldErrors.name = `Keep the name under ${NAME_MAX} characters.`;
  if (values.description.length > DESCRIPTION_MAX)
    fieldErrors.description = `Keep the description under ${DESCRIPTION_MAX} characters.`;

  const client = values.clientId
    ? await prisma.user.findFirst({
        where: { id: values.clientId, role: "CLIENT" },
        select: { id: true },
      })
    : null;
  if (!client) fieldErrors.clientId = "Choose the client this project is for.";

  if (Object.keys(fieldErrors).length || !client) {
    return { fieldErrors, values };
  }

  let projectId: string;
  try {
    const project = await prisma.$transaction(async (tx) => {
      const created = await tx.project.create({
        data: {
          name: values.name,
          description: values.description || null,
          clientId: client.id,
        },
        select: { id: true },
      });
      await tx.activity.create({
        data: { projectId: created.id, userId: user.id, type: "OTHER", message: "Project created" },
      });
      return created;
    });
    projectId = project.id;
  } catch (error) {
    console.error("createProject failed", error);
    return { error: "Something went wrong. Please try again.", values };
  }

  revalidateWorkspaces();
  redirect(`/admin/projects/${projectId}?created=project`);
}

/**
 * Creatives are now submitted by clients (src/lib/workflow/commands.ts,
 * createDraft). Team creation on a client's behalf is deferred (decision D6),
 * so this action only refuses. Existing legacy creatives are unaffected.
 */
export async function createCreative(): Promise<FormState> {
  await requireRole("TEAM");
  return { error: "Creatives are now submitted by the client. Ask the client to create a submission in this project." };
}
