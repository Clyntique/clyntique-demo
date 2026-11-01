import { describe, expect, it } from "vitest";
import type { PrismaClient } from "../src/generated/prisma/client";
import { runTier2Import } from "../prisma/policy-tier2-import";

// In-memory isolated database engine mirroring Render Production (cyntique_demo).
function createRehearsalDatabase() {
  const store = {
    users: [
      { id: "usr_1", email: "team@clyntique.demo", role: "TEAM", isPolicyAdmin: true },
      { id: "usr_2", email: "deepanshisingh1995@gmail.com", role: "TEAM", isPolicyAdmin: true },
      { id: "usr_3", email: "client1@pilot.test", role: "CLIENT", isPolicyAdmin: false },
      { id: "usr_4", email: "client2@pilot.test", role: "CLIENT", isPolicyAdmin: false },
    ],
    projects: [
      { id: "prj_1", name: "Pilot Project 1", clientId: "usr_3" },
      { id: "prj_2", name: "Pilot Project 2", clientId: "usr_3" },
      { id: "prj_3", name: "Pilot Project 3", clientId: "usr_4" },
      { id: "prj_4", name: "Pilot Project 4", clientId: "usr_4" },
      { id: "prj_5", name: "Pilot Project 5", clientId: "usr_4" },
    ],
    creatives: [
      { id: "cr_1", name: "Creative 1" },
      { id: "cr_2", name: "Creative 2" },
      { id: "cr_3", name: "Creative 3" },
      { id: "cr_4", name: "Creative 4" },
      { id: "cr_5", name: "Creative 5" },
      { id: "cr_6", name: "Creative 6" },
      { id: "cr_7", name: "Creative 7" },
      { id: "cr_8", name: "Creative 8" },
    ],
    markets: [{ code: "US" }, { code: "CA" }, { code: "AE" }],
    platforms: [{ code: "META" }, { code: "TIKTOK" }, { code: "GOOGLE" }],
    sources: [
      {
        id: "src_meta",
        name: "Meta Personal Attributes",
        officialUrl: "https://transparency.meta.com/policies/ad-standards/objectionable-content/privacy-violations-personal-attributes/",
        verificationStatus: "REQUIRES_REVIEW",
        updatedAt: new Date("2026-10-27T00:00:00Z"),
      },
      {
        id: "src_goog_pa",
        name: "Google Health Personalized",
        officialUrl: "https://support.google.com/adspolicy/answer/16701855",
        verificationStatus: "UNVERIFIED",
        updatedAt: new Date("2026-10-27T00:00:00Z"),
      },
      {
        id: "src_goog_hm",
        name: "Google Healthcare Medicines",
        officialUrl: "https://support.google.com/adspolicy/answer/176031",
        verificationStatus: "UNVERIFIED",
        updatedAt: new Date("2026-10-27T00:00:00Z"),
      },
    ],
    rules: [
      {
        id: "rule_meta",
        code: "RX-META-PA-01",
        title: "Meta Personal Health Attributes v1",
        currentVersionNumber: 1,
        authorityType: "PLATFORM_POLICY",
        jurisdictionCode: "GLOBAL",
        platformCode: "META",
        category: "PERSONAL_HEALTH_ATTRIBUTES",
        industry: "HEALTHCARE",
        updatedAt: new Date("2026-10-27T00:00:00Z"),
      },
      {
        id: "rule_goog_pa",
        code: "RX-GOOG-PA-01",
        title: "Google Health Personalization v1",
        currentVersionNumber: 1,
        authorityType: "PLATFORM_POLICY",
        jurisdictionCode: "GLOBAL",
        platformCode: "GOOGLE",
        category: "TARGETING_RESTRICTION",
        industry: "HEALTHCARE",
        updatedAt: new Date("2026-10-27T00:00:00Z"),
      },
      {
        id: "rule_goog_hm",
        code: "RX-GOOG-HM-01",
        title: "Google Healthcare and Medicines v1",
        currentVersionNumber: 1,
        authorityType: "PLATFORM_POLICY",
        jurisdictionCode: "GLOBAL",
        platformCode: "GOOGLE",
        category: "PRESCRIPTION_MEDICINE",
        industry: "HEALTHCARE",
        updatedAt: new Date("2026-10-27T00:00:00Z"),
      },
    ],
    versions: [
      {
        id: "ver_meta_1",
        ruleId: "rule_meta",
        versionNumber: 1,
        title: "Meta v1",
        status: "DRAFT",
        verificationStatus: "UNVERIFIED",
        createdById: "usr_1",
        reviewNote: "v1 original research draft",
        updatedAt: new Date("2026-10-27T00:00:00Z"),
      },
      {
        id: "ver_goog_pa_1",
        ruleId: "rule_goog_pa",
        versionNumber: 1,
        title: "Google PA v1",
        status: "DRAFT",
        verificationStatus: "UNVERIFIED",
        createdById: "usr_1",
        reviewNote: "v1 original research draft",
        updatedAt: new Date("2026-10-27T00:00:00Z"),
      },
      {
        id: "ver_goog_hm_1",
        ruleId: "rule_goog_hm",
        versionNumber: 1,
        title: "Google HM v1",
        status: "DRAFT",
        verificationStatus: "UNVERIFIED",
        createdById: "usr_1",
        reviewNote: "v1 composite draft",
        updatedAt: new Date("2026-10-27T00:00:00Z"),
      },
    ],
    citations: [
      { id: "cite_1", versionId: "ver_meta_1", sourceId: "src_meta" },
      { id: "cite_2", versionId: "ver_goog_pa_1", sourceId: "src_goog_pa" },
      { id: "cite_3", versionId: "ver_goog_hm_1", sourceId: "src_goog_hm" },
    ],
    events: [
      { id: "evt_1", ruleId: "rule_meta", kind: "RULE_CREATED" },
      { id: "evt_2", ruleId: "rule_goog_pa", kind: "RULE_CREATED" },
      { id: "evt_3", ruleId: "rule_goog_hm", kind: "RULE_CREATED" },
      { id: "evt_4", sourceId: "src_meta", kind: "SOURCE_CREATED" },
      { id: "evt_5", sourceId: "src_goog_pa", kind: "SOURCE_CREATED" },
      { id: "evt_6", sourceId: "src_goog_hm", kind: "SOURCE_CREATED" },
      { id: "evt_7", ruleId: "rule_meta", kind: "VERSION_PROPOSED" },
      { id: "evt_8", ruleId: "rule_goog_pa", kind: "VERSION_PROPOSED" },
      { id: "evt_9", ruleId: "rule_goog_hm", kind: "VERSION_PROPOSED" },
    ],
  };

  function clone<T>(val: T): T {
    return JSON.parse(JSON.stringify(val), (key, value) => {
      if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value)) {
        return new Date(value);
      }
      return value;
    });
  }

  type PrismaMockClient = {
    user: { findUnique: (args: { where: { email?: string } }) => Promise<typeof store.users[number] | null>; count: () => Promise<number> };
    project: { count: () => Promise<number> };
    creative: { count: () => Promise<number> };
    market: { findMany: () => Promise<Array<{ code: string }>> };
    adPlatform: { findMany: () => Promise<Array<{ code: string }>> };
    policySource: {
      findMany: (args?: { where?: { id?: { in?: string[] } } }) => Promise<typeof store.sources>;
      count: () => Promise<number>;
      create: (args: { data: Record<string, unknown> }) => Promise<typeof store.sources[number]>;
    };
    policyRule: {
      findMany: () => Promise<typeof store.rules>;
      count: () => Promise<number>;
      create: (args: { data: Record<string, unknown> }) => Promise<typeof store.rules[number]>;
      update: (args: { where: { id: string }; data: Record<string, unknown> }) => Promise<typeof store.rules[number]>;
    };
    policyRuleVersion: {
      findFirst: (args: { where: { ruleId?: string; versionNumber?: number } }) => Promise<typeof store.versions[number] | null>;
      count: (args?: { where?: { OR?: Array<{ status?: string; verificationStatus?: string }>; rule?: { code?: { in?: string[] } } } }) => Promise<number>;
      create: (args: { data: Record<string, unknown> }) => Promise<typeof store.versions[number]>;
      update: (args: { where: { id: string }; data: Record<string, unknown> }) => Promise<typeof store.versions[number]>;
    };
    policyRuleVersionSource: {
      create: (args: { data: Record<string, unknown> }) => Promise<typeof store.citations[number]>;
    };
    policyRuleEvent: {
      count: () => Promise<number>;
      create: (args: { data: Record<string, unknown> }) => Promise<typeof store.events[number]>;
    };
    $transaction: <T>(fn: (tx: PrismaMockClient) => Promise<T>) => Promise<T>;
    $disconnect: () => Promise<void>;
    _getStore: () => typeof store;
  };

  function createClient(currentStore: typeof store): PrismaMockClient {
    let idSeq = 100;
    return {
      user: {
        findUnique: async ({ where }: { where: { email?: string } }) => currentStore.users.find((u) => u.email === where.email) ?? null,
        count: async () => currentStore.users.length,
      },
      project: {
        count: async () => currentStore.projects.length,
      },
      creative: {
        count: async () => currentStore.creatives.length,
      },
      market: {
        findMany: async () => [...currentStore.markets],
      },
      adPlatform: {
        findMany: async () => [...currentStore.platforms],
      },
      policySource: {
        findMany: async ({ where }: { where?: { id?: { in?: string[] } } } = {}) => {
          if (where?.id?.in) {
            return currentStore.sources.filter((s) => where.id!.in!.includes(s.id));
          }
          return [...currentStore.sources];
        },
        count: async () => currentStore.sources.length,
        create: async ({ data }: { data: Record<string, unknown> }) => {
          const row = { id: `src_new_${++idSeq}`, updatedAt: new Date(), ...data } as unknown as typeof store.sources[number];
          currentStore.sources.push(row);
          return row;
        },
      },
      policyRule: {
        findMany: async () => [...currentStore.rules],
        count: async () => currentStore.rules.length,
        create: async ({ data }: { data: Record<string, unknown> }) => {
          const row = { id: `rule_new_${++idSeq}`, updatedAt: new Date(), ...data } as unknown as typeof store.rules[number];
          currentStore.rules.push(row);
          return row;
        },
        update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
          const idx = currentStore.rules.findIndex((r) => r.id === where.id);
          if (idx !== -1) {
            currentStore.rules[idx] = { ...currentStore.rules[idx], ...data, updatedAt: new Date() };
            return currentStore.rules[idx];
          }
          throw new Error("Rule not found");
        },
      },
      policyRuleVersion: {
        findFirst: async ({ where }: { where: { ruleId?: string; versionNumber?: number } }) => {
          return (
            currentStore.versions.find((v) => {
              if (where.ruleId && v.ruleId !== where.ruleId) return false;
              if (where.versionNumber && v.versionNumber !== where.versionNumber) return false;
              return true;
            }) ?? null
          );
        },
        count: async ({ where }: { where?: { OR?: Array<{ status?: string; verificationStatus?: string }>; rule?: { code?: { in?: string[] } } } } = {}) => {
          if (where?.OR) {
            return currentStore.versions.filter((v) => {
              const matchesOr = where.OR!.some((cond: { status?: string; verificationStatus?: string }) => {
                if (cond.status && v.status === cond.status) return true;
                if (cond.verificationStatus && v.verificationStatus === cond.verificationStatus) return true;
                return false;
              });
              if (!matchesOr) return false;
              if (where.rule?.code?.in) {
                const rule = currentStore.rules.find((r) => r.id === v.ruleId);
                return rule && where.rule.code.in.includes(rule.code);
              }
              return true;
            }).length;
          }
          return currentStore.versions.length;
        },
        create: async ({ data }: { data: Record<string, unknown> }) => {
          const row = { id: `ver_new_${++idSeq}`, createdAt: new Date(), updatedAt: new Date(), ...data } as unknown as typeof store.versions[number];
          currentStore.versions.push(row);
          return row;
        },
        update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
          const idx = currentStore.versions.findIndex((v) => v.id === where.id);
          if (idx !== -1) {
            currentStore.versions[idx] = { ...currentStore.versions[idx], ...data, updatedAt: new Date() };
            return currentStore.versions[idx];
          }
          throw new Error("Version not found");
        },
      },
      policyRuleVersionSource: {
        create: async ({ data }: { data: Record<string, unknown> }) => {
          const row = { id: `cite_new_${++idSeq}`, ...data } as unknown as typeof store.citations[number];
          currentStore.citations.push(row);
          return row;
        },
      },
      policyRuleEvent: {
        count: async () => currentStore.events.length,
        create: async ({ data }: { data: Record<string, unknown> }) => {
          const row = { id: `evt_new_${++idSeq}`, createdAt: new Date(), ...data } as unknown as typeof store.events[number];
          currentStore.events.push(row);
          return row;
        },
      },
      $transaction: async <T>(fn: (tx: PrismaMockClient) => Promise<T>): Promise<T> => {
        const snapshot = clone(currentStore);
        try {
          return await fn(createClient(currentStore));
        } catch (err) {
          // Rollback on failure
          Object.assign(currentStore, snapshot);
          throw err;
        }
      },
      $disconnect: async () => {},
      _getStore: () => currentStore,
    };
  }

  return createClient(store);
}

describe("Tier 2 Healthcare Policy Rehearsal on Isolated Database", () => {
  it("initial state exactly matches Production baseline", async () => {
    const db = createRehearsalDatabase();
    const store = db._getStore();

    expect(store.users).toHaveLength(4);
    expect(store.projects).toHaveLength(5);
    expect(store.creatives).toHaveLength(8);
    expect(store.sources).toHaveLength(3);
    expect(store.rules).toHaveLength(3);
    expect(store.versions).toHaveLength(3);
    expect(store.events).toHaveLength(9);
  });

  it("Test 1: Forced rollback cleanly rolls back all modifications on invariant failure", async () => {
    const db = createRehearsalDatabase();
    const initialSnapshot = JSON.stringify(db._getStore());

    await expect(
      runTier2Import(db as unknown as PrismaClient, {
        author: "team@clyntique.demo",
        apply: true,
        createVersions: true,
        dbName: "p0_local_rehearsal",
        testRollback: true,
        silent: true,
      }),
    ).rejects.toThrow(/rolled back/);

    // Verify complete rollback to pristine initial state
    const afterRollback = JSON.stringify(db._getStore());
    expect(afterRollback).toBe(initialSnapshot);
  });

  it("Test 2: Successful apply creates new sources, rules, v2 versions, and deprecates composite rule", async () => {
    const db = createRehearsalDatabase();

    const result = await runTier2Import(db as unknown as PrismaClient, {
      author: "team@clyntique.demo",
      apply: true,
      createVersions: true,
      dbName: "p0_local_rehearsal",
      testRollback: false,
      silent: true,
    });

    expect(result.applied).toBe(true);
    expect(result.newSourcesCount).toBe(4);
    expect(result.newRulesCount).toBe(6);
    expect(result.newVersionsCount).toBe(8); // 6 new v1 + 2 proposed v2

    const store = db._getStore();

    // Check exact table counts
    expect(store.sources).toHaveLength(7); // 3 existing + 4 new
    expect(store.rules).toHaveLength(9); // 3 existing + 6 new
    expect(store.versions).toHaveLength(11); // 3 deprecated v1 + 6 new v1 + 2 new v2
    expect(store.events).toHaveLength(22); // 9 initial + 13 new

    // Check RX-META-PA-01 version evolution
    const metaRule = store.rules.find((r) => r.code === "RX-META-PA-01")!;
    expect(metaRule.currentVersionNumber).toBe(2);
    const metaV1 = store.versions.find((v) => v.ruleId === metaRule.id && v.versionNumber === 1)!;
    const metaV2 = store.versions.find((v) => v.ruleId === metaRule.id && v.versionNumber === 2)!;
    expect(metaV1.status).toBe("DEPRECATED");
    expect(metaV2.status).toBe("DRAFT");
    expect(metaV2.verificationStatus).toBe("UNVERIFIED");

    // Check RX-GOOG-PA-01 version evolution
    const googPaRule = store.rules.find((r) => r.code === "RX-GOOG-PA-01")!;
    expect(googPaRule.currentVersionNumber).toBe(2);
    const googPaV1 = store.versions.find((v) => v.ruleId === googPaRule.id && v.versionNumber === 1)!;
    const googPaV2 = store.versions.find((v) => v.ruleId === googPaRule.id && v.versionNumber === 2)!;
    expect(googPaV1.status).toBe("DEPRECATED");
    expect(googPaV2.status).toBe("DRAFT");
    expect(googPaV2.verificationStatus).toBe("UNVERIFIED");

    // Check RX-GOOG-HM-01 supersession & deprecation
    const hmRule = store.rules.find((r) => r.code === "RX-GOOG-HM-01")!;
    const hmV1 = store.versions.find((v) => v.ruleId === hmRule.id && v.versionNumber === 1)!;
    expect(hmV1.status).toBe("DEPRECATED");
    expect(hmV1.reviewNote).toContain("SUPERSEDED RULE — INACTIVE");
    expect(hmV1.reviewNote).toContain("Cannot be verified or approved");

    // Check that replacement split rules exist as v1 DRAFT / UNVERIFIED
    const pdsRule = store.rules.find((r) => r.code === "RX-GOOG-PDS-01")!;
    const pdsV1 = store.versions.find((v) => v.ruleId === pdsRule.id && v.versionNumber === 1)!;
    expect(pdsV1.status).toBe("DRAFT");
    expect(pdsV1.verificationStatus).toBe("UNVERIFIED");

    const rdtRule = store.rules.find((r) => r.code === "RX-GOOG-RDT-01")!;
    const rdtV1 = store.versions.find((v) => v.ruleId === rdtRule.id && v.versionNumber === 1)!;
    expect(rdtV1.status).toBe("DRAFT");
    expect(rdtV1.verificationStatus).toBe("UNVERIFIED");

    // Check that pre-existing Meta source preserved its exact REQUIRES_REVIEW verification status
    const metaSource = store.sources.find((s) => s.id === "src_meta")!;
    expect(metaSource.verificationStatus).toBe("REQUIRES_REVIEW");

    // Verify that ZERO reviewable drafts become VERIFIED or ACTIVE
    const reviewableDrafts = store.versions.filter((v) => v.status === "DRAFT");
    expect(reviewableDrafts).toHaveLength(8); // 6 new v1 + 2 revised v2
    for (const v of reviewableDrafts) {
      expect(v.status).toBe("DRAFT");
      expect(v.verificationStatus).toBe("UNVERIFIED");
    }

    // Verify exact eight reviewable policy codes, including RX-US-FTC-TE-01
    const reviewableRuleCodes = reviewableDrafts.map((v) => {
      const rule = store.rules.find((r) => r.id === v.ruleId)!;
      return rule.code;
    }).sort();
    expect(reviewableRuleCodes).toEqual([
      "RX-GOOG-PA-01",
      "RX-GOOG-PDS-01",
      "RX-GOOG-RDT-01",
      "RX-META-PA-01",
      "RX-TIKTOK-HP-01",
      "RX-TIKTOK-MC-01",
      "RX-US-FTC-CS-01",
      "RX-US-FTC-TE-01",
    ]);

    const activeOrVerified = store.versions.filter((v) => v.status === "ACTIVE" || v.verificationStatus === "VERIFIED");
    expect(activeOrVerified).toHaveLength(0);

    // Verify unrelated production data remains completely untouched
    expect(store.users).toHaveLength(4);
    expect(store.projects).toHaveLength(5);
    expect(store.creatives).toHaveLength(8);
  });

  it("Test 3: Second execution is strictly idempotent with duplicate prevention", async () => {
    const db = createRehearsalDatabase();

    // First apply
    await runTier2Import(db as unknown as PrismaClient, {
      author: "team@clyntique.demo",
      apply: true,
      createVersions: true,
      dbName: "p0_local_rehearsal",
      silent: true,
    });

    const storeAfterFirst = db._getStore();
    expect(storeAfterFirst.sources).toHaveLength(7);
    expect(storeAfterFirst.rules).toHaveLength(9);
    expect(storeAfterFirst.versions).toHaveLength(11);
    expect(storeAfterFirst.events).toHaveLength(22);

    // Second apply
    const secondResult = await runTier2Import(db as unknown as PrismaClient, {
      author: "team@clyntique.demo",
      apply: true,
      createVersions: true,
      dbName: "p0_local_rehearsal",
      silent: true,
    });

    // Confirms 0 new sources and 0 new rules created on second run
    expect(secondResult.newSourcesCount).toBe(0);
    expect(secondResult.newRulesCount).toBe(0);

    const storeAfterSecond = db._getStore();
    expect(storeAfterSecond.sources).toHaveLength(7);
    expect(storeAfterSecond.rules).toHaveLength(9);
    expect(storeAfterSecond.versions).toHaveLength(11);
    expect(storeAfterSecond.events).toHaveLength(22);
  });
});
