import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CurrentUser } from "@/lib/auth/dal";
import { CLIENT_A, createPrismaMock, type PrismaMock } from "./helpers";
import { hashPassword } from "@/lib/auth/password";

const h = vi.hoisted(() => ({
  user: null as CurrentUser | null,
  prisma: null as unknown as PrismaMock,
}));

vi.mock("@/lib/prisma", () => ({
  get prisma() {
    return h.prisma;
  },
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/auth/dal", () => ({
  getCurrentUser: async () => h.user,
  requireUser: async () => {
    if (!h.user) throw new Error("REDIRECT /auth/login");
    return h.user;
  },
  requireRole: async (role: string) => {
    if (!h.user) throw new Error("REDIRECT /auth/login");
    if (h.user.role !== role) throw new Error(`REDIRECT ${h.user.role === "TEAM" ? "/admin" : "/dashboard"}`);
    return h.user;
  },
}));

const { getFullProfile } = await import("@/lib/profile/data");
const { updateProfileAction, changePasswordAction } = await import("@/lib/profile/actions");
const { POST: avatarPost, DELETE: avatarDelete } = await import("@/app/api/profile/avatar/route");

beforeEach(() => {
  h.prisma = createPrismaMock();
  h.user = null;
  vi.clearAllMocks();
});

describe("Profile Data Layer — getFullProfile", () => {
  it("returns null when user record is not found", async () => {
    h.prisma.user.findUnique.mockResolvedValue(null);
    const profile = await getFullProfile("non-existent-id");
    expect(profile).toBeNull();
  });

  it("returns existing profile record when present", async () => {
    const createdAt = new Date("2026-01-15T12:00:00Z");
    h.prisma.user.findUnique.mockResolvedValue({
      id: "client-a",
      name: "Alice Smith",
      email: "alice@acme.com",
      role: "CLIENT",
      createdAt,
      isPolicyAdmin: false,
      profile: {
        avatarUrl: "https://blob.example.com/alice.png",
        firstName: "Alice",
        lastName: "Smith",
        phone: "+1 555-0100",
        city: "San Francisco",
        state: "CA",
        country: "USA",
        timezone: "America/Los_Angeles",
        preferredLanguage: "en-US",
        jobTitle: "Marketing Director",
        companyName: "Acme Health",
        department: "Growth",
        bio: "Oversees advertising compliance",
      },
    });

    const profile = await getFullProfile("client-a");
    expect(profile).not.toBeNull();
    expect(profile?.firstName).toBe("Alice");
    expect(profile?.lastName).toBe("Smith");
    expect(profile?.avatarUrl).toBe("https://blob.example.com/alice.png");
    expect(profile?.timezone).toBe("America/Los_Angeles");
    expect(profile?.companyName).toBe("Acme Health");
    expect(profile?.email).toBe("alice@acme.com");
    expect(profile?.role).toBe("CLIENT");
  });

  it("gracefully falls back when profile row is null (existing user compatibility)", async () => {
    const createdAt = new Date("2026-01-15T12:00:00Z");
    h.prisma.user.findUnique.mockResolvedValue({
      id: "client-b",
      name: "Bob Robert Johnson",
      email: "bob@healthcare.org",
      role: "CLIENT",
      createdAt,
      isPolicyAdmin: false,
      profile: null, // No profile row yet
    });

    const profile = await getFullProfile("client-b");
    expect(profile).not.toBeNull();
    expect(profile?.firstName).toBe("Bob");
    expect(profile?.lastName).toBe("Robert Johnson");
    expect(profile?.timezone).toBe("UTC");
    expect(profile?.preferredLanguage).toBe("en-US");
    expect(profile?.avatarUrl).toBeNull();
    expect(profile?.phone).toBe("");
    expect(profile?.bio).toBe("");
  });
});

describe("Profile Server Actions — updateProfileAction", () => {
  it("rejects unauthenticated requests", async () => {
    h.user = null;
    const formData = new FormData();
    formData.append("firstName", "Jane");

    const result = await updateProfileAction(undefined, formData);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/session has ended/i);
    expect(h.prisma.userProfile.upsert).not.toHaveBeenCalled();
  });

  it("updates personal details and syncs user name", async () => {
    h.user = CLIENT_A;
    h.prisma.userProfile.upsert.mockResolvedValue({ id: "profile-1" });
    h.prisma.user.update.mockResolvedValue({ id: CLIENT_A.id, name: "Alice Wonderland" });

    const formData = new FormData();
    formData.append("firstName", "Alice");
    formData.append("lastName", "Wonderland");
    formData.append("phone", "+1 555-9876");
    formData.append("city", "Boston");
    formData.append("state", "MA");
    formData.append("country", "USA");
    formData.append("timezone", "America/New_York");
    formData.append("preferredLanguage", "en-US");
    formData.append("companyName", "Wonderland Therapeutics");
    formData.append("jobTitle", "VP Regulatory");
    formData.append("department", "Compliance");
    formData.append("bio", "Ensuring FDA & FTC alignment");

    const result = await updateProfileAction(undefined, formData);
    expect(result.ok).toBe(true);

    // Verifies User.name was updated
    expect(h.prisma.user.update).toHaveBeenCalledWith({
      where: { id: CLIENT_A.id },
      data: { name: "Alice Wonderland" },
    });

    // Verifies UserProfile was upserted for session user
    expect(h.prisma.userProfile.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: CLIENT_A.id },
        create: expect.objectContaining({
          userId: CLIENT_A.id,
          firstName: "Alice",
          lastName: "Wonderland",
          city: "Boston",
          companyName: "Wonderland Therapeutics",
        }),
      })
    );
  });

  it("strictly ignores attempts to escalate role, email, or policyAdmin", async () => {
    h.user = CLIENT_A;
    h.prisma.userProfile.upsert.mockResolvedValue({ id: "profile-1" });

    const formData = new FormData();
    formData.append("firstName", "Malicious");
    formData.append("role", "TEAM");
    formData.append("isPolicyAdmin", "true");
    formData.append("email", "hacker@evil.com");
    formData.append("userId", "victim-user-id");

    const result = await updateProfileAction(undefined, formData);
    expect(result.ok).toBe(true);

    // Profile upsert MUST target the authenticated session user, not victim-user-id
    const upsertCall = h.prisma.userProfile.upsert.mock.calls[0][0];
    expect(upsertCall.where.userId).toBe(CLIENT_A.id);
    expect(upsertCall.create.userId).toBe(CLIENT_A.id);

    // Role, isPolicyAdmin, and email MUST NOT be passed to upsert
    expect((upsertCall.create as Record<string, unknown>).role).toBeUndefined();
    expect((upsertCall.create as Record<string, unknown>).isPolicyAdmin).toBeUndefined();
    expect((upsertCall.create as Record<string, unknown>).email).toBeUndefined();
  });
});

describe("Password Server Actions — changePasswordAction", () => {
  it("rejects demo accounts", async () => {
    h.user = { ...CLIENT_A, demoSession: true };
    const formData = new FormData();
    formData.append("currentPassword", "old-pass");
    formData.append("newPassword", "new-secure-pass");
    formData.append("confirmPassword", "new-secure-pass");

    const result = await changePasswordAction(undefined, formData);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/demo account/i);
    expect(h.prisma.user.update).not.toHaveBeenCalled();
  });

  it("validates minimum length of 8 characters", async () => {
    h.user = CLIENT_A;
    const formData = new FormData();
    formData.append("currentPassword", "valid-current");
    formData.append("newPassword", "short");
    formData.append("confirmPassword", "short");

    const result = await changePasswordAction(undefined, formData);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/at least 8 characters/i);
  });

  it("rejects mismatched confirm password", async () => {
    h.user = CLIENT_A;
    const formData = new FormData();
    formData.append("currentPassword", "valid-current");
    formData.append("newPassword", "new-valid-pass");
    formData.append("confirmPassword", "different-pass");

    const result = await changePasswordAction(undefined, formData);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/do not match/i);
  });

  it("verifies current password against stored hash", async () => {
    h.user = CLIENT_A;
    const realHash = await hashPassword("correct-old-password");
    h.prisma.user.findUnique.mockResolvedValue({ passwordHash: realHash });

    const formData = new FormData();
    formData.append("currentPassword", "wrong-password");
    formData.append("newPassword", "brand-new-password");
    formData.append("confirmPassword", "brand-new-password");

    const result = await changePasswordAction(undefined, formData);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/current password is incorrect/i);
    expect(h.prisma.user.update).not.toHaveBeenCalled();
  });

  it("prevents reusing the same password", async () => {
    h.user = CLIENT_A;
    const currentPass = "existing-secure-password";
    const realHash = await hashPassword(currentPass);
    h.prisma.user.findUnique.mockResolvedValue({ passwordHash: realHash });

    const formData = new FormData();
    formData.append("currentPassword", currentPass);
    formData.append("newPassword", currentPass);
    formData.append("confirmPassword", currentPass);

    const result = await changePasswordAction(undefined, formData);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/different from current password/i);
  });

  it("successfully updates password with valid current password", async () => {
    h.user = CLIENT_A;
    const currentPass = "correct-old-pass";
    const realHash = await hashPassword(currentPass);
    h.prisma.user.findUnique.mockResolvedValue({ passwordHash: realHash });
    h.prisma.user.update.mockResolvedValue({ id: CLIENT_A.id });

    const formData = new FormData();
    formData.append("currentPassword", currentPass);
    formData.append("newPassword", "new-awesome-password-2026");
    formData.append("confirmPassword", "new-awesome-password-2026");

    const result = await changePasswordAction(undefined, formData);
    expect(result.ok).toBe(true);
    expect(result.message).toMatch(/updated successfully/i);
    expect(h.prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: CLIENT_A.id },
        data: expect.objectContaining({
          passwordHash: expect.any(String),
        }),
      })
    );
  });
});

describe("Avatar Upload API — /api/profile/avatar", () => {
  it("rejects unauthorized POST request", async () => {
    h.user = null;
    const req = new Request("http://localhost/api/profile/avatar", { method: "POST" });
    const res = await avatarPost(req);
    expect(res.status).toBe(401);
  });

  it("rejects POST without image file", async () => {
    h.user = CLIENT_A;
    const formData = new FormData();
    const req = new Request("http://localhost/api/profile/avatar", {
      method: "POST",
      body: formData,
    });
    const res = await avatarPost(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/no image file/i);
  });

  it("rejects file larger than 2 MB", async () => {
    h.user = CLIENT_A;
    // 2.5 MB fake buffer
    const largeBlob = new Blob([new Uint8Array(2.5 * 1024 * 1024)], { type: "image/png" });
    const formData = new FormData();
    formData.append("file", largeBlob, "large.png");

    const req = new Request("http://localhost/api/profile/avatar", {
      method: "POST",
      body: formData,
    });
    const res = await avatarPost(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/must not exceed 2 MB/i);
  });

  it("rejects unsupported MIME types", async () => {
    h.user = CLIENT_A;
    const textBlob = new Blob(["hello world"], { type: "text/plain" });
    const formData = new FormData();
    formData.append("file", textBlob, "test.txt");

    const req = new Request("http://localhost/api/profile/avatar", {
      method: "POST",
      body: formData,
    });
    const res = await avatarPost(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/unsupported image format/i);
  });

  it("rejects mismatched magic bytes", async () => {
    h.user = CLIENT_A;
    // Declares image/png but content is plain text
    const badBytes = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    const fakeBlob = new Blob([badBytes], { type: "image/png" });
    const formData = new FormData();
    formData.append("file", fakeBlob, "spoofed.png");

    const req = new Request("http://localhost/api/profile/avatar", {
      method: "POST",
      body: formData,
    });
    const res = await avatarPost(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/does not match the image format/i);
  });

  it("successfully uploads valid PNG image and upserts profile", async () => {
    h.user = CLIENT_A;
    // Valid PNG header (89 50 4E 47 0D 0A 1A 0A) followed by 8 dummy bytes
    const pngHeader = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0, 0, 0, 0]);
    const validBlob = new Blob([pngHeader], { type: "image/png" });
    const formData = new FormData();
    formData.append("file", validBlob, "valid.png");

    h.prisma.userProfile.findUnique.mockResolvedValue(null);
    h.prisma.userProfile.upsert.mockResolvedValue({ id: "profile-1" });

    const req = new Request("http://localhost/api/profile/avatar", {
      method: "POST",
      body: formData,
    });
    const res = await avatarPost(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.avatarUrl).toMatch(/^data:image\/png;base64,/);

    expect(h.prisma.userProfile.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: CLIENT_A.id },
        create: expect.objectContaining({
          userId: CLIENT_A.id,
          avatarUrl: expect.stringContaining("data:image/png;base64,"),
        }),
      })
    );
  });

  it("successfully removes avatar via DELETE", async () => {
    h.user = CLIENT_A;
    h.prisma.userProfile.findUnique.mockResolvedValue({ avatarUrl: "https://example.com/avatar.png" });
    h.prisma.userProfile.updateMany.mockResolvedValue({ count: 1 });

    const res = await avatarDelete();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);

    expect(h.prisma.userProfile.updateMany).toHaveBeenCalledWith({
      where: { userId: CLIENT_A.id },
      data: { avatarUrl: null },
    });
  });
});
