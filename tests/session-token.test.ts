import { describe, expect, it } from "vitest";
import { decodeSession, encodeSession } from "@/lib/auth/session-token";

const inAnHour = () => new Date(Date.now() + 60 * 60 * 1000);

describe("session token", () => {
  it("round-trips a valid session", async () => {
    const token = await encodeSession({ userId: "u1", role: "CLIENT" }, inAnHour());
    await expect(decodeSession(token)).resolves.toEqual({ userId: "u1", role: "CLIENT" });
  });

  it("rejects a missing, garbage or tampered token", async () => {
    await expect(decodeSession(undefined)).resolves.toBeNull();
    await expect(decodeSession("not-a-jwt")).resolves.toBeNull();
    const token = await encodeSession({ userId: "u1", role: "CLIENT" }, inAnHour());
    const [header, , signature] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ userId: "u1", role: "TEAM" })).toString("base64url");
    await expect(decodeSession(`${header}.${forged}.${signature}`)).resolves.toBeNull();
  });

  it("rejects an expired token", async () => {
    const token = await encodeSession({ userId: "u1", role: "TEAM" }, new Date(Date.now() - 1000));
    await expect(decodeSession(token)).resolves.toBeNull();
  });
});
