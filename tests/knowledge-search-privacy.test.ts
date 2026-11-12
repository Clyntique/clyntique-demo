import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import type { CurrentUser } from "@/lib/auth/dal";
import { CLIENT_A, CLIENT_B, TEAM, createPrismaMock, type PrismaMock } from "./helpers";

// Search-question privacy (Nov 10, issue #30): a knowledge question is logged
// only when a person submits the search form; the results page and its
// auto-refresh never log and never reach an AI service; the privacy notice
// sits next to the question box; and question-log retention is prepared but
// inactive, and can only ever delete question-log rows. Prisma and the
// session are mocked; nothing connects to a database or an AI service.

const h = vi.hoisted(() => ({ prisma: null as unknown as PrismaMock, user: null as CurrentUser | null, rules: vi.fn(), gemini: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  get prisma() {
    return h.prisma;
  },
}));
vi.mock("@/generated/prisma/client", () => ({
  Prisma: {
    PrismaClientKnownRequestError: class extends Error {
      code = "";
    },
    sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({ strings: [...strings], values }),
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`REDIRECT ${path}`);
  },
}));
vi.mock("@/lib/auth/dal", () => ({ getCurrentUser: async () => h.user }));
vi.mock("@/lib/review/blob", () => ({ headBlob: vi.fn(), readBlob: vi.fn(), isPrivateBlobUrl: () => true, uploadsConfigured: () => true }));
vi.mock("@vercel/blob", () => ({ del: vi.fn() }));
vi.mock("@/lib/policy/db", () => ({ getDbPolicyRules: () => h.rules() }));
vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    models = { generateContent: (args: unknown) => h.gemini(args) };
  },
}));

const actions = await import("@/lib/knowledge/actions");
const query = await import("@/lib/knowledge/query");
const retention = await import("@/lib/knowledge/retention");

const ROOT = process.cwd();
const read = (...parts: string[]) => readFileSync(join(ROOT, ...parts), "utf8");
const ROW = (id: string, documentId: string) => ({ id, documentId, page: 1, text: `passage ${id}`, snippet: `[[passage]] ${id}`, rank: 0.9 });

function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [k, v] of Object.entries(fields)) data.set(k, v);
  return data;
}

beforeEach(() => {
  h.prisma = createPrismaMock();
  h.user = null;
  h.rules.mockReset().mockResolvedValue([]);
  h.gemini.mockReset();
  delete process.env.KNOWLEDGE_AI_ANSWERS;
  delete process.env.GEMINI_API_KEY;
  delete process.env.KNOWLEDGE_QUERY_RETENTION_DAYS;
  h.prisma.libraryDocument.findMany.mockResolvedValue([{ id: "d1", title: "Study 2025", type: "CLINICAL_STUDY", fileName: "study.pdf", ownerClientId: CLIENT_A.id }]);
  h.prisma.$queryRaw.mockResolvedValue([ROW("c1", "d1")]);
  h.prisma.knowledgeQuery.create.mockResolvedValue({ id: "q1" });
});

describe("the search form action (submitKnowledgeSearchAction): permissions and logging", () => {
  it("a signed-out request is sent to sign-in; nothing is searched or logged", async () => {
    await expect(actions.submitKnowledgeSearchAction(form({ q: "laser hair removal" }))).rejects.toThrow("REDIRECT /auth/login");
    expect(h.prisma.$queryRaw).not.toHaveBeenCalled();
    expect(h.prisma.knowledgeQuery.create).not.toHaveBeenCalled();
  });

  it("a client's search is logged once in their own workspace and lands on their own results page with the log id", async () => {
    h.user = CLIENT_A;
    await expect(actions.submitKnowledgeSearchAction(form({ q: "  laser hair   removal evidence " }))).rejects.toThrow("REDIRECT /dashboard/evidence?q=laser+hair+removal+evidence&s=q1");
    expect(h.prisma.knowledgeQuery.create).toHaveBeenCalledTimes(1);
    expect(h.prisma.knowledgeQuery.create.mock.calls[0][0].data).toMatchObject({ userId: CLIENT_A.id, ownerClientId: CLIENT_A.id, question: "laser hair removal evidence", aiUsed: false });
  });

  it("the workspace and role come from the session, never from the form: forged fields are ignored", async () => {
    h.user = CLIENT_B;
    await expect(actions.submitKnowledgeSearchAction(form({ q: "laser hair removal", role: "TEAM", userId: CLIENT_A.id, ownerClientId: CLIENT_A.id, s: "someone-elses" }))).rejects.toThrow("REDIRECT /dashboard/evidence?q=laser+hair+removal&s=q1");
    expect(h.prisma.knowledgeQuery.create.mock.calls[0][0].data).toMatchObject({ userId: CLIENT_B.id, ownerClientId: CLIENT_B.id });
    // The search itself ran in client B's scope only.
    const sql = JSON.stringify(h.prisma.$queryRaw.mock.calls[0][0]);
    expect(sql).toContain(CLIENT_B.id);
    expect(sql).not.toContain(CLIENT_A.id);
  });

  it("the team's search is logged against Clyntique's library and lands on the team page", async () => {
    h.user = TEAM;
    await expect(actions.submitKnowledgeSearchAction(form({ q: "laser hair removal" }))).rejects.toThrow("REDIRECT /admin/evidence?q=laser+hair+removal&s=q1");
    expect(h.prisma.knowledgeQuery.create.mock.calls[0][0].data).toMatchObject({ userId: TEAM.id, ownerClientId: null });
  });

  it("an example question is a form submission too, and is logged the same way", async () => {
    h.user = CLIENT_A;
    await expect(actions.submitKnowledgeSearchAction(form({ q: "", example: "Which documents support this statement?" }))).rejects.toThrow(/REDIRECT \/dashboard\/evidence\?q=Which\+documents\+support\+this\+statement%3F&s=q1/);
    expect(h.prisma.knowledgeQuery.create.mock.calls[0][0].data.question).toBe("Which documents support this statement?");
  });

  it("an empty or unsearchable question is not logged; an over-long one is cut to the limit", async () => {
    h.user = CLIENT_A;
    await expect(actions.submitKnowledgeSearchAction(form({ q: "   " }))).rejects.toThrow("REDIRECT /dashboard/evidence");
    await expect(actions.submitKnowledgeSearchAction(form({ q: "the and of" }))).rejects.toThrow("REDIRECT /dashboard/evidence?q=the%20and%20of");
    expect(h.prisma.knowledgeQuery.create).not.toHaveBeenCalled();
    await expect(actions.submitKnowledgeSearchAction(form({ q: "evidence ".repeat(100) }))).rejects.toThrow(/REDIRECT/);
    expect(h.prisma.knowledgeQuery.create.mock.calls[0][0].data.question.length).toBeLessThanOrEqual(query.QUESTION_MAX_CHARS);
  });

  it("when the audit row cannot be written, the browser gets no search id, so no results are shown", async () => {
    h.user = CLIENT_A;
    h.prisma.$transaction.mockRejectedValueOnce(new Error("connection lost"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(actions.submitKnowledgeSearchAction(form({ q: "laser hair removal" }))).rejects.toThrow("REDIRECT /dashboard/evidence?q=laser+hair+removal");
    await expect(actions.submitKnowledgeSearchAction(form({ q: "laser hair removal" }))).rejects.not.toThrow(/&s=$/);
  });
});

describe("the results page only reads (source checks)", () => {
  const view = read("src", "components", "evidence", "evidence-dictionary-view.tsx");
  const box = read("src", "components", "evidence", "knowledge-search.tsx");

  it("the page never calls the logging function, and searches only a question that has its own log row", () => {
    expect(view).not.toContain("submitKnowledgeSearch");
    expect(view).toContain("findLoggedSearch(user, one(params.s), question)");
    expect(view).toContain("logged ? searchKnowledge(user, logged.question, { searchId: logged.id }) : Promise.resolve(null)");
    expect(view).not.toMatch(/knowledgeQuery\.(create|update|delete)/);
  });

  it("only the form action logs: nothing else in the app calls submitKnowledgeSearch or writes KnowledgeQuery", () => {
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) {
          if (name !== "generated") walk(path);
        } else if (/\.tsx?$/.test(name)) files.push(path);
      }
    };
    walk(join(ROOT, "src"));
    const rel = (p: string) => p.slice(ROOT.length + 1).replace(/\\/g, "/");
    const callers = files.filter((f) => /submitKnowledgeSearch\(/.test(readFileSync(f, "utf8"))).map(rel).sort();
    expect(callers).toEqual(["src/lib/knowledge/actions.ts", "src/lib/knowledge/search.ts"]);
    const writers = files.filter((f) => /knowledgeQuery\s*\.\s*(create|createMany|update|updateMany|upsert|delete|deleteMany)\b/.test(readFileSync(f, "utf8"))).map(rel).sort();
    // The only other writer is the inactive retention module, which nothing in src imports (asserted below).
    expect(writers).toEqual(["src/lib/knowledge/retention.ts", "src/lib/knowledge/search.ts"]);
  });

  it("the question box posts to the logging action, and example questions are submit buttons, not links that search on load", () => {
    expect(box).toContain("<form action={submitKnowledgeSearchAction}");
    expect(box).not.toContain('method="get"');
    expect(box).toContain('<button type="submit" name="example" value={q}');
    expect(box).not.toMatch(/href=\{`[^`]*\?q=/);
  });
});

describe("privacy notice", () => {
  const box = read("src", "components", "evidence", "knowledge-search.tsx");

  it("tells people not to enter patient-identifying or sensitive personal information, and that questions are saved", () => {
    expect(query.KNOWLEDGE_PRIVACY_NOTICE).toMatch(/do not enter patient names/i);
    expect(query.KNOWLEDGE_PRIVACY_NOTICE).toMatch(/identifies a person/);
    expect(query.KNOWLEDGE_PRIVACY_NOTICE).toMatch(/sensitive personal information/);
    expect(query.KNOWLEDGE_PRIVACY_NOTICE).toMatch(/saved in an audit log/);
  });

  it("is rendered inside the search form, directly under the question input, always (not only before a search), and announced with the input", () => {
    const formStart = box.indexOf("<form action={submitKnowledgeSearchAction}");
    const formEnd = box.indexOf("</form>", formStart);
    const input = box.indexOf('<Input name="q"', formStart);
    const notice = box.indexOf("{KNOWLEDGE_PRIVACY_NOTICE}", formStart);
    const examples = box.indexOf("{!question && (", formStart);
    expect(formStart).toBeGreaterThan(-1);
    expect(input).toBeGreaterThan(formStart);
    expect(notice).toBeGreaterThan(input);
    expect(notice).toBeLessThan(formEnd);
    expect(notice).toBeLessThan(examples); // outside the "no question yet" block
    expect(box).toContain('aria-describedby="knowledge-privacy-notice"');
    expect(box).toContain('<p id="knowledge-privacy-notice" role="note"');
  });
});

describe("question-log retention: prepared, inactive, and unable to touch anything else", () => {
  const NOW = new Date("2026-11-10T00:00:00.000Z");
  const store = () => ({ knowledgeQuery: { count: vi.fn().mockResolvedValue(11), deleteMany: vi.fn().mockResolvedValue({ count: 4 }) } });

  it("is disabled unless a valid period is configured: unset, empty, malformed or out-of-range values delete nothing and read nothing", async () => {
    for (const value of [undefined, "", " ", "0", "7", "29", "3651", "99999", "-90", "90.5", "90d", "1e3", "ninety", "0x5A", "90; DROP"]) {
      const env = value === undefined ? {} : { KNOWLEDGE_QUERY_RETENTION_DAYS: value };
      expect(retention.questionLogRetentionDays(env)).toBeNull();
      const s = store();
      const outcome = await retention.purgeExpiredQuestionLogs(s, { apply: true, env, now: NOW });
      expect(outcome.enabled).toBe(false);
      expect(s.knowledgeQuery.count).not.toHaveBeenCalled();
      expect(s.knowledgeQuery.deleteMany).not.toHaveBeenCalled();
    }
    // The process default (nothing configured anywhere) is disabled too.
    expect(retention.questionLogRetentionDays()).toBeNull();
  });

  it("no retention period is configured in the repository, and nothing schedules or exposes the clean-up", () => {
    expect(read(".env.example")).not.toMatch(/^\s*KNOWLEDGE_QUERY_RETENTION_DAYS\s*=/m);
    const vercel = (() => {
      try {
        return read("vercel.json");
      } catch {
        return "{}";
      }
    })();
    expect(vercel).not.toContain("crons");
    // No route, action, page or component imports the retention module.
    const importers: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) {
          if (name !== "generated") walk(path);
        } else if (/\.tsx?$/.test(name) && /knowledge\/retention/.test(readFileSync(path, "utf8"))) importers.push(path);
      }
    };
    walk(join(ROOT, "src"));
    expect(importers).toEqual([]);
    expect(read("package.json")).not.toContain("knowledge-query-retention");
  });

  it("with a valid period, a dry run (the default) only counts", async () => {
    const s = store();
    s.knowledgeQuery.count.mockResolvedValueOnce(11).mockResolvedValueOnce(4);
    const outcome = await retention.purgeExpiredQuestionLogs(s, { env: { KNOWLEDGE_QUERY_RETENTION_DAYS: "90" }, now: NOW });
    expect(outcome).toEqual({ enabled: true, days: 90, cutoff: new Date("2026-08-12T00:00:00.000Z"), applied: false, total: 11, eligible: 4, deleted: 0 });
    expect(s.knowledgeQuery.deleteMany).not.toHaveBeenCalled();
  });

  it("with apply, deletes only question-log rows strictly older than the cut-off, by age alone", async () => {
    const s = store();
    s.knowledgeQuery.count.mockResolvedValueOnce(11).mockResolvedValueOnce(4);
    const outcome = await retention.purgeExpiredQuestionLogs(s, { apply: true, env: { KNOWLEDGE_QUERY_RETENTION_DAYS: "365" }, now: NOW });
    expect(outcome).toMatchObject({ enabled: true, days: 365, applied: true, eligible: 4, deleted: 4 });
    expect(s.knowledgeQuery.deleteMany).toHaveBeenCalledTimes(1);
    expect(s.knowledgeQuery.deleteMany).toHaveBeenCalledWith({ where: { createdAt: { lt: new Date("2025-11-10T00:00:00.000Z") } } });
    expect(() => retention.retentionCutoff(1)).toThrow();
    expect(() => retention.retentionCutoff(Number.NaN)).toThrow();
  });

  it("run against the full database client, it touches no model except the question log", async () => {
    const outcome = await retention.purgeExpiredQuestionLogs(h.prisma, { apply: true, env: { KNOWLEDGE_QUERY_RETENTION_DAYS: "90" }, now: NOW });
    expect(outcome.enabled).toBe(true);
    expect(h.prisma.knowledgeQuery.deleteMany).toHaveBeenCalledTimes(1);
    for (const [name, model] of Object.entries(h.prisma)) {
      if (name === "knowledgeQuery" || name.startsWith("$")) continue;
      for (const fn of Object.values(model as Record<string, ReturnType<typeof vi.fn>>)) expect(fn, name).not.toHaveBeenCalled();
    }
    expect(h.prisma.$queryRaw).not.toHaveBeenCalled();
    expect(h.prisma.$executeRaw).not.toHaveBeenCalled();
    expect(h.prisma.$transaction).not.toHaveBeenCalled();
  });

  it("the module has no database import of its own and names no other table", () => {
    const source = read("src", "lib", "knowledge", "retention.ts");
    expect(source).not.toMatch(/^import /m);
    const code = source.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
    expect(code).not.toMatch(/libraryDocument|libraryChunk|evidenceRecord|evidence\b|creative|submission|policy|message|activity|user\b|\$queryRaw|\$executeRaw/i);
    expect(code.match(/deleteMany/g)?.length).toBe(2); // the type and the one call
  });

  it("deleting a question-log row cannot cascade: no other table references KnowledgeQuery in the schema", () => {
    const schema = read("prisma", "schema.prisma");
    const model = /model KnowledgeQuery \{[\s\S]*?\n\}/.exec(schema)?.[0] ?? "";
    expect(model).toContain("model KnowledgeQuery {");
    // Its only relation points outwards, to the person who asked, and deleting a log row never deletes the person.
    expect(model.match(/@relation\(/g)?.length).toBe(1);
    expect(model).toContain("user User @relation(fields: [userId], references: [id], onDelete: Restrict)");
    const elsewhere = schema.replace(model, "");
    const references = elsewhere.split("\n").filter((line) => /\bKnowledgeQuery\b/.test(line) && !line.trim().startsWith("//"));
    expect(references.map((l) => l.trim().replace(/\s+/g, " "))).toEqual(["knowledgeQueries KnowledgeQuery[]"]);
    // And no migration adds a foreign key that points at the question log.
    const migrations = readdirSync(join(ROOT, "prisma", "migrations")).filter((d) => statSync(join(ROOT, "prisma", "migrations", d)).isDirectory());
    for (const dir of migrations) {
      expect(read("prisma", "migrations", dir, "migration.sql"), dir).not.toMatch(/REFERENCES\s+"KnowledgeQuery"/);
    }
  });

  it("the manual script is a dry run by default and needs three separate confirmations to delete", () => {
    const script = read("prisma", "knowledge-query-retention.ts");
    expect(script).toContain('argv.includes("--apply")');
    expect(script).toContain('argv.includes("--retention-approved")');
    expect(script).toContain("process.env.RETENTION_CONFIRM_DATABASE !== dbName");
    expect(script).toContain('isolationLevel: "RepeatableRead"');
    expect(script).toContain("everything was rolled back");
    expect(script).not.toMatch(/console\.log\([^)]*question\b[^-]/); // counts only, never question text
  });
});
