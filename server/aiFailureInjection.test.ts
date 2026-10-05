import { beforeEach, describe, expect, it } from "vitest";
import { PROVIDER_SAFETY_POLICY, TransformProviderSafetyError, providerRetryDelay } from "./providerSafety";
import { getTransformMetrics, recordTransformMetric, resetTransformMetricsForTests } from "./transformMetrics";

describe("AI failure-injection production boundaries", () => {
  beforeEach(() => resetTransformMetricsForTests());

  it("pins a finite provider retry and cost envelope", () => {
    expect(PROVIDER_SAFETY_POLICY.maxAttempts).toBe(3);
    expect(PROVIDER_SAFETY_POLICY.deadlineMs).toBe(45_000);
    expect(PROVIDER_SAFETY_POLICY.retryBaseMs).toBe(500);
    expect(PROVIDER_SAFETY_POLICY.retryCapMs).toBe(6_000);
    expect(PROVIDER_SAFETY_POLICY.failureThreshold).toBe(5);
    expect(PROVIDER_SAFETY_POLICY.estimatedCompletionTokens).toBe(2_400);
    expect(PROVIDER_SAFETY_POLICY.dailyReservedTokenBudget).toBe(480_000);
    expect(providerRetryDelay(30, () => 1)).toBe(PROVIDER_SAFETY_POLICY.retryCapMs);
  });

  it("uses typed, content-free safety failures for deadline, circuit, and budget conditions", () => {
    const errors = [
      new TransformProviderSafetyError("DEADLINE_EXCEEDED", true, 1_000),
      new TransformProviderSafetyError("PROVIDER_CIRCUIT_OPEN", true, 60_000),
      new TransformProviderSafetyError("BUDGET_EXHAUSTED", false, 86_400_000),
    ];
    expect(errors.map(error => error.code)).toEqual(["DEADLINE_EXCEEDED", "PROVIDER_CIRCUIT_OPEN", "BUDGET_EXHAUSTED"]);
    expect(errors.map(error => error.message)).toEqual(errors.map(error => error.code));
    expect(errors.every(error => !error.message.includes("prompt") && !error.message.includes("input"))).toBe(true);
  });

  it("keeps telemetry metadata-only even when a failure code is adversarially named", () => {
    recordTransformMetric({
      at: Date.now(),
      elapsedMs: 45_000,
      queueWaitMs: 2_000,
      mode: "rewrite",
      intensity: "high",
      outcome: "error",
      providerFailure: true,
      failureCode: "DEADLINE_EXCEEDED",
    });
    const serialized = JSON.stringify(getTransformMetrics());
    expect(serialized).toContain("DEADLINE_EXCEEDED");
    expect(serialized).not.toMatch(/inputText|outputText|prompt|protectedTerms|userId|documentId/i);
  });

  it("never treats a provider-safety error as an accepted candidate", () => {
    const safetyError = new TransformProviderSafetyError("PROVIDER_CIRCUIT_OPEN", true, 5_000);
    expect(safetyError.retryable).toBe(true);
    expect(safetyError.code).not.toBe("ACCEPTED");
  });
});
