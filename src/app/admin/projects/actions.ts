"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { CreativeFormat, type CreativeStatus } from "@/generated/prisma/enums";
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
// New creatives start as a draft or go straight to the client.
const INITIAL_STATUSES: CreativeStatus[] = ["DRAFT", "IN_REVIEW"];

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

export async function createCreative(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireRole("TEAM");

  const values = {
    projectId: text(formData, "projectId"),
    name: text(formData, "name"),
    description: text(formData, "description"),
    format: text(formData, "format"),
    status: text(formData, "status"),
  };
  const fieldErrors: Record<string, string> = {};

  if (values.name.length < 2) fieldErrors.name = "Enter a creative name (at least 2 characters).";
  else if (values.name.length > NAME_MAX) fieldErrors.name = `Keep the name under ${NAME_MAX} characters.`;
  if (values.description.length > DESCRIPTION_MAX)
    fieldErrors.description = `Keep the notes under ${DESCRIPTION_MAX} characters.`;

  const format = Object.values(CreativeFormat).find((f) => f === values.format);
  if (!format) fieldErrors.format = "Choose a format.";
  const status = INITIAL_STATUSES.find((s) => s === values.status);
  if (!status) fieldErrors.status = "Choose whether to share it now or keep it as a draft.";

  const project = values.projectId
    ? await prisma.project.findUnique({ where: { id: values.projectId }, select: { id: true } })
    : null;
  if (!project) return { error: "This project no longer exists.", values };

  if (Object.keys(fieldErrors).length || !format || !status) {
    return { fieldErrors, values };
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.creative.create({
        data: {
          projectId: project.id,
          name: values.name,
          description: values.description || null,
          format,
          status,
        },
      });
      // Drafts are not visible to the client, so they are not announced
      // on the shared project timeline.
      if (status !== "DRAFT") {
        await tx.activity.create({
          data: {
            projectId: project.id,
            userId: user.id,
            type: "CREATIVE_UPLOADED",
            message: `Shared “${values.name}” for review`,
          },
        });
      }
    });
  } catch (error) {
    console.error("createCreative failed", error);
    return { error: "Something went wrong. Please try again.", values };
  }

  revalidateWorkspaces();
  redirect(`/admin/projects/${project.id}?created=creative`);
}
