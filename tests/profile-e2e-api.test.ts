import { beforeEach, describe, expect, it, vi } from "vitest";
import bcrypt from "bcryptjs";
import type { CurrentUser } from "@/lib/auth/dal";
import { CLIENT_A, createPrismaMock, type PrismaMock } from "./helpers";

const h = vi.hoisted(() => ({
  prisma: null as unknown as PrismaMock,
  currentUser: null as CurrentUser | null,
}));

vi.mock("@/lib/prisma", () => ({
  get prisma() {
    return h.prisma;
  },
}));

vi.mock("@/lib/auth/dal", () => ({
  getCurrentUser: vi.fn(async () => h.currentUser),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import * as avatarRoute from "@/app/api/profile/avatar/route";
import { updateProfileAction, changePasswordAction } from "@/lib/profile/actions";

// Genuine 1x1 pixel PNG bytes
const GENUINE_PNG_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
  0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00,
  0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
  0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49,
  0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
]);

// Genuine JPEG magic bytes
const GENUINE_JPEG_BYTES = new Uint8Array([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
  0x01, 0x01, 0x00, 0x48, 0x00, 0x48, 0x00, 0x00, 0xff, 0xdb, 0x00, 0x43,
  0x00, 0xff, 0xd9,
]);

describe("Profile & Avatar Real API Lifecycle (PR B / PR C Validation)", () => {
  beforeEach(() => {
    h.prisma = createPrismaMock();
    h.currentUser = CLIENT_A;
  });

  describe("POST /api/profile/avatar — Upload and Replacement", () => {
    it("successfully uploads a genuine PNG and saves base64 data URI when blob token is absent", async () => {
      const formData = new FormData();
      const file = new File([GENUINE_PNG_BYTES], "avatar.png", { type: "image/png" });
      formData.append("file", file);

      const req = new Request("http://localhost:3000/api/profile/avatar", {
        method: "POST",
        body: formData,
      });

      const res = await avatarRoute.POST(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.avatarUrl).toContain("data:image/png;base64,");

      // Verifies database upsert
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

    it("successfully replaces existing avatar with a genuine JPEG image", async () => {
      h.prisma.userProfile.findUnique.mockResolvedValue({
        id: "prof-1",
        userId: CLIENT_A.id,
        avatarUrl: "data:image/png;base64,olddata",
      });

      const formData = new FormData();
      const file = new File([GENUINE_JPEG_BYTES], "avatar.jpg", { type: "image/jpeg" });
      formData.append("file", file);

      const req = new Request("http://localhost:3000/api/profile/avatar", {
        method: "POST",
        body: formData,
      });

      const res = await avatarRoute.POST(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.avatarUrl).toContain("data:image/jpeg;base64,");
      expect(h.prisma.userProfile.upsert).toHaveBeenCalled();
    });

    it("refuses disguised files whose content does not match image magic bytes", async () => {
      const fakeBytes = new TextEncoder().encode("Not really a PNG file content");
      const formData = new FormData();
      const file = new File([fakeBytes], "fake.png", { type: "image/png" });
      formData.append("file", file);

      const req = new Request("http://localhost:3000/api/profile/avatar", {
        method: "POST",
        body: formData,
      });

      const res = await avatarRoute.POST(req);
      const json = await res.json();

      expect(res.status).toBe(400);
      expect(json.ok).toBe(false);
      expect(json.error).toMatch(/does not match/i);
      expect(h.prisma.userProfile.upsert).not.toHaveBeenCalled();
    });

    it("refuses files exceeding 2MB limit", async () => {
      const oversizedBytes = new Uint8Array(2 * 1024 * 1024 + 1);
      const formData = new FormData();
      const file = new File([oversizedBytes], "large.png", { type: "image/png" });
      formData.append("file", file);

      const req = new Request("http://localhost:3000/api/profile/avatar", {
        method: "POST",
        body: formData,
      });

      const res = await avatarRoute.POST(req);
      const json = await res.json();

      expect(res.status).toBe(400);
      expect(json.error).toMatch(/exceed 2 MB/i);
    });
  });

  describe("DELETE /api/profile/avatar — Clean Removal", () => {
    it("clears avatar in UserProfile and sets avatarUrl to null", async () => {
      h.prisma.userProfile.findUnique.mockResolvedValue({
        id: "prof-1",
        userId: CLIENT_A.id,
        avatarUrl: "data:image/png;base64,someavatar",
      });

      const res = await avatarRoute.DELETE();
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);

      expect(h.prisma.userProfile.updateMany).toHaveBeenCalledWith({
        where: { userId: CLIENT_A.id },
        data: { avatarUrl: null },
      });
    });
  });

  describe("updateProfileAction — Full Form Submission Lifecycle", () => {
    it("persists comprehensive profile fields while strictly preventing email/role edits", async () => {
      const formData = new FormData();
      formData.set("firstName", "Alexandra");
      formData.set("lastName", "Vance");
      formData.set("phone", "+1 555-0199");
      formData.set("city", "Boston");
      formData.set("state", "MA");
      formData.set("country", "United States");
      formData.set("timezone", "America/New_York");
      formData.set("preferredLanguage", "en-US");
      formData.set("jobTitle", "VP Regulatory Affairs");
      formData.set("companyName", "Biopharma Labs");
      formData.set("department", "Compliance");
      formData.set("bio", "Leading healthcare regulatory submissions.");

      // Attempted malicious role escalation payload in form data
      formData.set("role", "TEAM");
      formData.set("isPolicyAdmin", "true");
      formData.set("email", "hacked@admin.com");

      const result = await updateProfileAction(undefined, formData);
      expect(result.ok).toBe(true);

      // Verify User name update
      expect(h.prisma.user.update).toHaveBeenCalledWith({
        where: { id: CLIENT_A.id },
        data: { name: "Alexandra Vance" },
      });

      // Verify UserProfile upsert includes validated fields only (no role or email)
      const upsertArgs = h.prisma.userProfile.upsert.mock.calls[0][0];
      expect(upsertArgs.where).toEqual({ userId: CLIENT_A.id });
      expect(upsertArgs.create.city).toBe("Boston");
      expect(upsertArgs.create.jobTitle).toBe("VP Regulatory Affairs");
      expect(upsertArgs.create.companyName).toBe("Biopharma Labs");
      expect(upsertArgs.create.role).toBeUndefined();
      expect(upsertArgs.create.email).toBeUndefined();
    });
  });

  describe("changePasswordAction — Disposable Account Security", () => {
    it("refuses password changes on shared demo accounts", async () => {
      h.currentUser = {
        id: "demo-client-id",
        name: "Demo Client",
        email: "client@clyntique.demo",
        role: "CLIENT" as const,
        demoSession: true,
      };

      const formData = new FormData();
      formData.set("currentPassword", "Demo123!456");
      formData.set("newPassword", "BrandNewPass999!");
      formData.set("confirmPassword", "BrandNewPass999!");

      const result = await changePasswordAction(undefined, formData);
      expect(result.ok).toBe(false);
      expect(result.error).toMatch(/disabled for quick-login demo accounts/i);
      expect(h.prisma.user.update).not.toHaveBeenCalled();
    });

    it("verifies and updates password on an authorized disposable account", async () => {
      const currentPlain = "OldSecretPassword123!";
      const newPlain = "NewSecurePassword456!";
      const hashedOld = await bcrypt.hash(currentPlain, 10);

      const disposableUser = {
        id: "disposable-user-99",
        name: "Disposable User",
        email: "test-disposable@company.internal",
        role: "CLIENT" as const,
      };
      h.currentUser = disposableUser;

      h.prisma.user.findUnique.mockResolvedValue({
        id: disposableUser.id,
        email: disposableUser.email,
        passwordHash: hashedOld,
      });

      const formData = new FormData();
      formData.set("currentPassword", currentPlain);
      formData.set("newPassword", newPlain);
      formData.set("confirmPassword", newPlain);

      const result = await changePasswordAction(undefined, formData);
      expect(result.ok).toBe(true);

      // Verifies update call with newly hashed password
      expect(h.prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: disposableUser.id },
          data: expect.objectContaining({
            passwordHash: expect.any(String),
          }),
        })
      );

      const updatedHash = h.prisma.user.update.mock.calls[0][0].data.passwordHash;
      expect(await bcrypt.compare(newPlain, updatedHash)).toBe(true);
    });
  });
});
