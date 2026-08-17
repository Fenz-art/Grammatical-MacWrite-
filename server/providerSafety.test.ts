import { describe, expect, it } from "vitest";
import { PROVIDER_SAFETY_POLICY, TransformProviderSafetyError, providerRetryDelay } from "./providerSafety";

describe("provider safety policy", () => {
  it("uses bounded equal-jitter retry delays", () => {
    expect(providerRetryDelay(0, () => 0)).toBe(250);
    expect(providerRetryDelay(0, () => 1)).toBe(500);
    expect(providerRetryDelay(3, () => 0)).toBe(2_000);
    expect(providerRetryDelay(20, () => 1)).toBe(PROVIDER_SAFETY_POLICY.retryCapMs);
  });

  it("preserves typed non-content provider safety reasons", () => {
    const error = new TransformProviderSafetyError("DEADLINE_EXCEEDED", true, 3_000);
    expect(error).toMatchObject({ name: "TransformProviderSafetyError", code: "DEADLINE_EXCEEDED", retryable: true, retryAfterMs: 3_000 });
    expect(error.message).not.toContain("prompt");
  });
});
