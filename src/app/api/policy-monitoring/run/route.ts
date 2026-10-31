import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";
import type { CurrentUser } from "@/lib/auth/dal";
import { runDueSourceChecks } from "@/lib/policy/monitoring/service";

/*
 * Operator-triggered runner for the due source checks (the "configurable
 * daily check"). The application schedules nothing itself: an operator may
 * later point a scheduler at this route once both variables are set.
 *
 * - POLICY_MONITORING_RUN_SECRET: required as `Authorization: Bearer <secret>`.
 * - POLICY_MONITORING_ACTOR_EMAIL: the TEAM policy administrator on whose
 *   behalf the run is recorded (snapshots, proposals and events name them).
 *
 * With either variable unset the route answers 404, so an environment that
 * has not opted in exposes nothing. Checks only open review-queue items;
 * they never change a rule or a source's verification status.
 */

function secretMatches(header: string | null, secret: string): boolean {
  const presented = header?.startsWith("Bearer ") ? header.slice(7).trim() : "";
  const a = Buffer.from(presented);
  const b = Buffer.from(secret);
  return a.length === b.length && a.length > 0 && timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  const secret = process.env.POLICY_MONITORING_RUN_SECRET ?? "";
  const actorEmail = (process.env.POLICY_MONITORING_ACTOR_EMAIL ?? "").trim().toLowerCase();
  if (secret.length < 16 || !actorEmail) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (!secretMatches(request.headers.get("authorization"), secret)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const actor = await prisma.user.findUnique({ where: { email: actorEmail }, select: { id: true, name: true, email: true, role: true, isPolicyAdmin: true } });
  if (!actor || actor.role !== "TEAM" || !actor.isPolicyAdmin) {
    return NextResponse.json({ error: "The configured actor is not a TEAM policy administrator." }, { status: 403 });
  }
  const user: CurrentUser = { id: actor.id, name: actor.name, email: actor.email, role: actor.role, isPolicyAdmin: true };

  try {
    const results = await runDueSourceChecks(user);
    return NextResponse.json({
      ok: true,
      checked: results.length,
      changes: results.filter((r) => r.changed).length,
      results: results.map((r) => ({ sourceId: r.sourceId, source: r.sourceName, outcome: r.outcome, changed: r.changed, proposalId: r.proposalId, summary: r.summary })),
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Run failed." }, { status: 500 });
  }
}
