import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "@/proxy";
import { SESSION_COOKIE, encodeSession } from "@/lib/auth/session-token";

async function request(path: string, role?: "TEAM" | "CLIENT") {
  const headers = new Headers();
  if (role) {
    const token = await encodeSession({ userId: "u1", role }, new Date(Date.now() + 60_000));
    headers.set("cookie", `${SESSION_COOKIE}=${token}`);
  }
  return proxy(new NextRequest(new URL(path, "http://localhost:3000"), { headers }));
}

const location = (res: Response) => res.headers.get("location") && new URL(res.headers.get("location")!).pathname;

describe("proxy (optimistic redirects)", () => {
  it("sends signed-out users to login", async () => {
    expect(location(await request("/admin"))).toBe("/auth/login");
    expect(location(await request("/dashboard/creatives"))).toBe("/auth/login");
  });

  it("keeps each role in its own area", async () => {
    expect(location(await request("/admin/projects", "CLIENT"))).toBe("/dashboard");
    expect(location(await request("/dashboard", "TEAM"))).toBe("/admin");
    expect(location(await request("/admin", "TEAM"))).toBeNull();
    expect(location(await request("/dashboard", "CLIENT"))).toBeNull();
  });

  it("sends signed-in users away from the login page", async () => {
    expect(location(await request("/auth/login", "CLIENT"))).toBe("/dashboard");
  });
});
