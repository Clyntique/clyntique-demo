import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/dal";
import { prisma } from "@/lib/prisma";
import { del, put } from "@vercel/blob";

const MAX_AVATAR_BYTES = 2 * 1024 * 1024; // 2MB
const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function ascii(bytes: Uint8Array, start: number, end: number) {
  return String.fromCharCode(...bytes.subarray(start, end));
}

function verifyImageBytes(bytes: Uint8Array, mimeType: string): boolean {
  if (bytes.length < 12) return false;
  switch (mimeType) {
    case "image/jpeg":
      return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    case "image/png":
      return [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((v, i) => bytes[i] === v);
    case "image/webp":
      return ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WEBP";
    default:
      return false;
  }
}

function extensionFor(mimeType: string): string {
  switch (mimeType) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    default:
      return "bin";
  }
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid form data" }, { status: 400 });
  }

  const file = formData.get("file");
  if (!file || typeof file === "string" || !(file instanceof Blob)) {
    return NextResponse.json({ ok: false, error: "No image file provided" }, { status: 400 });
  }

  if (file.size > MAX_AVATAR_BYTES) {
    return NextResponse.json(
      { ok: false, error: "Image size must not exceed 2 MB." },
      { status: 400 }
    );
  }

  const mimeType = file.type;
  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    return NextResponse.json(
      { ok: false, error: "Unsupported image format. Please use JPG, PNG, or WebP." },
      { status: 400 }
    );
  }

  const arrayBuffer = await file.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);

  if (!verifyImageBytes(bytes, mimeType)) {
    return NextResponse.json(
      { ok: false, error: "File content does not match the image format." },
      { status: 400 }
    );
  }

  // Load existing profile to find prior avatar for cleanup
  const existingProfile = await prisma.userProfile.findUnique({
    where: { userId: user.id },
    select: { avatarUrl: true },
  });

  let newAvatarUrl: string;
  const token = process.env.BLOB_READ_WRITE_TOKEN;

  if (token) {
    // Production / Vercel Blob store
    const ext = extensionFor(mimeType);
    const pathname = `avatars/${user.id}-${Date.now()}.${ext}`;
    const blob = await put(pathname, Buffer.from(bytes), {
      access: "public",
      contentType: mimeType,
      token,
    });
    newAvatarUrl = blob.url;

    // Clean up previous blob if it was stored in blob storage
    if (existingProfile?.avatarUrl?.includes("blob.vercel-storage.com")) {
      await del(existingProfile.avatarUrl, { token }).catch(() => {});
    }
  } else {
    // Offline / Local development fallback using base64 data URI
    const base64 = Buffer.from(bytes).toString("base64");
    newAvatarUrl = `data:${mimeType};base64,${base64}`;
  }

  await prisma.userProfile.upsert({
    where: { userId: user.id },
    create: {
      userId: user.id,
      avatarUrl: newAvatarUrl,
    },
    update: {
      avatarUrl: newAvatarUrl,
    },
  });

  revalidatePath("/admin", "layout");
  revalidatePath("/dashboard", "layout");

  return NextResponse.json({ ok: true, avatarUrl: newAvatarUrl });
}

export async function DELETE() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const existingProfile = await prisma.userProfile.findUnique({
    where: { userId: user.id },
    select: { avatarUrl: true },
  });

  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (token && existingProfile?.avatarUrl?.includes("blob.vercel-storage.com")) {
    await del(existingProfile.avatarUrl, { token }).catch(() => {});
  }

  await prisma.userProfile.updateMany({
    where: { userId: user.id },
    data: { avatarUrl: null },
  });

  revalidatePath("/admin", "layout");
  revalidatePath("/dashboard", "layout");

  return NextResponse.json({ ok: true });
}
