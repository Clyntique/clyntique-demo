import { afterEach, describe, expect, it, vi } from "vitest";
import { UploadStalledError, withStallGuard } from "@/lib/upload-stall";

// Browser uploads retry network errors for minutes; the guard gives up after
// a period with no progress so the form shows an error instead of hanging.
afterEach(() => vi.useRealTimers());

describe("withStallGuard", () => {
  it("rejects with UploadStalledError and aborts when no progress arrives", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const result = withStallGuard(controller, () => new Promise<never>(() => {}), 1000);
    const assertion = expect(result).rejects.toBeInstanceOf(UploadStalledError);
    await vi.advanceTimersByTimeAsync(1001);
    await assertion;
    expect(controller.signal.aborted).toBe(true);
  });

  it("keeps going while progress arrives, and resolves with the upload", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const result = withStallGuard(
      controller,
      (progress) =>
        new Promise<string>((resolve) => {
          let n = 0;
          const tick = setInterval(() => {
            progress();
            if (++n === 5) {
              clearInterval(tick);
              resolve("done");
            }
          }, 800);
        }),
      1000,
    );
    await vi.advanceTimersByTimeAsync(4000);
    await expect(result).resolves.toBe("done");
    expect(controller.signal.aborted).toBe(false);
  });

  it("passes the upload's own error through", async () => {
    const controller = new AbortController();
    await expect(withStallGuard(controller, async () => Promise.reject(new Error("too large")), 1000)).rejects.toThrow("too large");
  });
});
