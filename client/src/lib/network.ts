export type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export async function fetchWithNetworkRetry(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  fetcher: FetchLike = globalThis.fetch.bind(globalThis),
  maxAttempts = 3,
): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      return await fetcher(input, init);
    } catch (error) {
      lastError = error;
      if (init?.signal?.aborted || (error instanceof DOMException && error.name === "AbortError") || attempt >= maxAttempts - 1) break;
      await new Promise(resolve => setTimeout(resolve, 150 * 2 ** attempt));
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Network request failed.");
}
