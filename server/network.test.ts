import { describe, expect, it, vi } from "vitest";
import { fetchWithNetworkRetry } from "../client/src/lib/network";

describe("fetchWithNetworkRetry", () => {
  it("recovers from transient network rejection without changing the response", async () => {
    const fetcher = vi.fn<Parameters<typeof fetchWithNetworkRetry>[2]>().mockRejectedValueOnce(new Error("Failed to fetch")).mockResolvedValueOnce(new Response("ok", { status: 200 }));
    await expect(fetchWithNetworkRetry("/api/trpc", {}, fetcher, 3)).resolves.toMatchObject({ status: 200 });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("does not retry an HTTP response or exceed the attempt budget", async () => {
    const response = new Response("unauthorized", { status: 401 });
    const fetcher = vi.fn<Parameters<typeof fetchWithNetworkRetry>[2]>().mockResolvedValue(response);
    await expect(fetchWithNetworkRetry("/api/trpc", {}, fetcher, 3)).resolves.toBe(response);
    expect(fetcher).toHaveBeenCalledTimes(1);

    const failing = vi.fn<Parameters<typeof fetchWithNetworkRetry>[2]>().mockRejectedValue(new Error("offline"));
    await expect(fetchWithNetworkRetry("/api/trpc", {}, failing, 2)).rejects.toThrow("offline");
    expect(failing).toHaveBeenCalledTimes(2);
  });

  it("does not retry an aborted request", async () => {
    const controller = new AbortController();
    controller.abort();
    const fetcher = vi.fn<Parameters<typeof fetchWithNetworkRetry>[2]>().mockRejectedValue(new Error("aborted"));
    await expect(fetchWithNetworkRetry("/api/trpc", { signal: controller.signal }, fetcher, 3)).rejects.toThrow("aborted");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
