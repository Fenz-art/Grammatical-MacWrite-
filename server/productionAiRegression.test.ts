import { describe, expect, it } from "vitest";
import { PROVIDER_SAFETY_POLICY, providerRetryDelay } from "./providerSafety";
import { runSemanticGuard } from "./semanticGuard";

describe("production AI regression: adversarial candidates never reach accepted output", () => {
  const adversarial: Array<[string, string, string]> = [
    ["numbers drift", "PostgreSQL may process 10,000 requests.", "PostgreSQL may process 1,000 requests."],
    ["negation drift", "Do not drop the URL https://example.com.", "Always drop the URL https://example.com."],
    ["url loss", "See https://example.com/api for details.", "See the documentation for details."],
    ["terminology loss", "Use the GraphQL client safely.", "Use the client safely."],
  ];
  for (const [name, source, candidate] of adversarial) {
    it(`rejects ${name}`, () => {
      expect(runSemanticGuard(source, candidate).accepted).toBe(false);
    });
  }
});

describe("production failure injection: provider retry is bounded and deterministic", () => {
  it("applies equal-jitter backoff within the retry cap", () => {
    expect(providerRetryDelay(0, () => 0)).toBe(250);
    expect(providerRetryDelay(3, () => 0)).toBe(2_000);
    expect(providerRetryDelay(20, () => 1)).toBe(PROVIDER_SAFETY_POLICY.retryCapMs);
    expect(providerRetryDelay(0, () => 1)).toBe(500);
    expect(providerRetryDelay(0, () => 0)).toBeGreaterThan(0);
  });

  it("never exceeds the configured retry cap under high attempt counts", () => {
    for (let attempt = 0; attempt < 30; attempt += 1) {
      expect(providerRetryDelay(attempt, () => 1)).toBeLessThanOrEqual(PROVIDER_SAFETY_POLICY.retryCapMs);
    }
  });
});
