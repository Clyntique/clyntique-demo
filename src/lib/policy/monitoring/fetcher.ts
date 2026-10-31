import { OFFICIAL_DOMAINS } from "../validate";
import { hashBytes, hashText, normalizeHtml, normalizePlainText } from "./normalize";

/*
 * Fetching one official page. The service only ever fetches a source's
 * registered official URL, and only on a known official domain. One request
 * per source per run, an honest user agent, no retries inside a run and no
 * attempt to get around a block: a blocked page is reported as BLOCKED and
 * left for a human.
 *
 * Tests use `fixtureFetcher`, which never touches the network.
 */

export type FetchOutcome = "OK" | "REDIRECTED" | "NOT_FOUND" | "BLOCKED" | "UNREACHABLE" | "ERROR" | "SKIPPED";

export interface FetchedPage {
  outcome: FetchOutcome;
  httpStatus: number | null;
  finalUrl: string | null;
  contentType: string | null;
  byteLength: number | null;
  /** Normalized text for HTML and plain text; a short descriptor for binary documents. */
  text: string | null;
  contentHash: string | null;
  statedDate: Date | null;
  errorMessage: string | null;
}

export interface SourceFetcher {
  name: string;
  fetch(url: string): Promise<FetchedPage>;
}

export const USER_AGENT = "ClyntiqueMonitor/1.0 (policy change monitoring; one request per source per check)";
export const FETCH_TIMEOUT_MS = 20_000;
/** Largest response read (bytes); larger documents are hashed from what was read. */
export const MAX_BYTES = 5 * 1024 * 1024;

export function isOfficialUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return false;
    const host = u.hostname.toLowerCase();
    return OFFICIAL_DOMAINS.some((d) => host === d || host.endsWith(`.${d}`));
  } catch {
    return false;
  }
}

/** Same page: ignores scheme, "www.", a trailing slash and fragment/UTM-style tracking. */
export function sameLocation(a: string, b: string): boolean {
  const norm = (s: string) => {
    try {
      const u = new URL(s);
      const host = u.hostname.toLowerCase().replace(/^www\./, "");
      const path = u.pathname.replace(/\/+$/, "") || "/";
      const params = [...u.searchParams.entries()].filter(([k]) => !/^(utm_|hl$|ref$|fbclid$|gclid$)/i.test(k)).sort();
      return `${host}${path}?${params.map(([k, v]) => `${k}=${v}`).join("&")}`;
    } catch {
      return s;
    }
  };
  return norm(a) === norm(b);
}

export function classifyStatus(status: number): FetchOutcome {
  if (status >= 200 && status < 300) return "OK";
  if (status === 404 || status === 410) return "NOT_FOUND";
  if (status === 401 || status === 403 || status === 429 || status === 503) return "BLOCKED";
  return "ERROR";
}

/** Known bot-challenge markers in a 200 response. */
const CHALLENGE_MARKERS = [/just a moment/i, /enable javascript and cookies to continue/i, /verify you are (a )?human/i, /access denied/i, /captcha/i];

export function looksLikeChallenge(html: string): boolean {
  const head = html.slice(0, 20_000);
  return CHALLENGE_MARKERS.some((m) => m.test(head)) && head.length < 20_000;
}

/** Builds the page record from a response body, shared by the HTTP and fixture fetchers. */
export function pageFromBody(input: { status: number; finalUrl: string; requestedUrl: string; contentType: string | null; body: Uint8Array | string }): FetchedPage {
  const contentType = (input.contentType ?? "").toLowerCase();
  const bytes = typeof input.body === "string" ? new TextEncoder().encode(input.body) : input.body;
  let outcome = classifyStatus(input.status);
  const isHtml = contentType.includes("html") || contentType === "";
  const isText = contentType.startsWith("text/") && !isHtml;

  if (outcome === "OK" && !sameLocation(input.requestedUrl, input.finalUrl)) outcome = "REDIRECTED";

  if (outcome === "OK" || outcome === "REDIRECTED") {
    if (isHtml) {
      const html = typeof input.body === "string" ? input.body : new TextDecoder("utf-8", { fatal: false }).decode(bytes);
      if (looksLikeChallenge(html)) {
        return { outcome: "BLOCKED", httpStatus: input.status, finalUrl: input.finalUrl, contentType, byteLength: bytes.byteLength, text: null, contentHash: null, statedDate: null, errorMessage: "The page returned a bot challenge instead of content." };
      }
      const page = normalizeHtml(html);
      return { outcome, httpStatus: input.status, finalUrl: input.finalUrl, contentType, byteLength: bytes.byteLength, text: page.text, contentHash: hashText(page.text), statedDate: page.statedDate, errorMessage: null };
    }
    if (isText) {
      const page = normalizePlainText(typeof input.body === "string" ? input.body : new TextDecoder().decode(bytes));
      return { outcome, httpStatus: input.status, finalUrl: input.finalUrl, contentType, byteLength: bytes.byteLength, text: page.text, contentHash: hashText(page.text), statedDate: page.statedDate, errorMessage: null };
    }
    // PDF or other binary: compared by bytes only.
    return { outcome, httpStatus: input.status, finalUrl: input.finalUrl, contentType, byteLength: bytes.byteLength, text: `[binary document: ${contentType || "unknown type"}, ${bytes.byteLength} bytes]`, contentHash: hashBytes(bytes), statedDate: null, errorMessage: null };
  }

  return { outcome, httpStatus: input.status, finalUrl: input.finalUrl, contentType, byteLength: bytes.byteLength, text: null, contentHash: null, statedDate: null, errorMessage: `HTTP ${input.status}` };
}

/** Live fetcher. Used only by the service, only for official URLs. */
export const httpFetcher: SourceFetcher = {
  name: "http",
  async fetch(url: string): Promise<FetchedPage> {
    if (!isOfficialUrl(url)) {
      return { outcome: "SKIPPED", httpStatus: null, finalUrl: null, contentType: null, byteLength: null, text: null, contentHash: null, statedDate: null, errorMessage: "Not an https URL on a known official domain." };
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        method: "GET",
        redirect: "follow",
        signal: controller.signal,
        headers: { "user-agent": USER_AGENT, accept: "text/html,application/xhtml+xml,application/pdf,text/plain;q=0.9,*/*;q=0.5", "accept-language": "en" },
        cache: "no-store",
      });
      const buffer = new Uint8Array(await res.arrayBuffer());
      const body = buffer.byteLength > MAX_BYTES ? buffer.subarray(0, MAX_BYTES) : buffer;
      return pageFromBody({ status: res.status, finalUrl: res.url || url, requestedUrl: url, contentType: res.headers.get("content-type"), body });
    } catch (error) {
      const message = error instanceof Error ? (error.name === "AbortError" ? `Timed out after ${FETCH_TIMEOUT_MS / 1000}s` : error.message) : String(error);
      return { outcome: "UNREACHABLE", httpStatus: null, finalUrl: null, contentType: null, byteLength: null, text: null, contentHash: null, statedDate: null, errorMessage: message.slice(0, 300) };
    } finally {
      clearTimeout(timer);
    }
  },
};

export interface FixtureResponse {
  status?: number;
  finalUrl?: string;
  contentType?: string;
  body?: string;
  /** Simulate a network failure instead of a response. */
  networkError?: string;
}

/** A fetcher that answers from a map of canned responses; unknown URLs are UNREACHABLE. */
export function fixtureFetcher(responses: Record<string, FixtureResponse | (() => FixtureResponse)>): SourceFetcher & { calls: string[] } {
  const calls: string[] = [];
  return {
    name: "fixture",
    calls,
    async fetch(url: string): Promise<FetchedPage> {
      if (!isOfficialUrl(url)) {
        return { outcome: "SKIPPED", httpStatus: null, finalUrl: null, contentType: null, byteLength: null, text: null, contentHash: null, statedDate: null, errorMessage: "Not an https URL on a known official domain." };
      }
      calls.push(url);
      const entry = responses[url];
      const fixture = typeof entry === "function" ? entry() : entry;
      if (!fixture || fixture.networkError) {
        return { outcome: "UNREACHABLE", httpStatus: null, finalUrl: null, contentType: null, byteLength: null, text: null, contentHash: null, statedDate: null, errorMessage: fixture?.networkError ?? "No fixture for this URL (simulated connection failure)." };
      }
      return pageFromBody({ status: fixture.status ?? 200, finalUrl: fixture.finalUrl ?? url, requestedUrl: url, contentType: fixture.contentType ?? "text/html; charset=utf-8", body: fixture.body ?? "" });
    },
  };
}
