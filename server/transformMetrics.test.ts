import { beforeEach, describe, expect, it } from "vitest";
import { getTransformMetrics, recordTransformMetric, resetTransformMetricsForTests } from "./transformMetrics";

describe("transform metrics", () => {
  beforeEach(() => resetTransformMetricsForTests());

  it("aggregates latency, queue wait, provider failures, success rate, mode outcomes, and queue throughput without storing user text", () => {
    const now = Date.now();
    recordTransformMetric({ at: now - 1_000, elapsedMs: 1_200, queueWaitMs: 20, mode: "rewrite", intensity: "high", outcome: "accepted", providerFailure: false });
    recordTransformMetric({ at: now - 500, elapsedMs: 2_000, queueWaitMs: 40, mode: "improve", intensity: "standard", outcome: "error", providerFailure: true, failureCode: "SERVICE_UNAVAILABLE" });
    recordTransformMetric({ at: now - 200, elapsedMs: 800, queueWaitMs: 60, mode: "proofread", intensity: "low", outcome: "rejected", providerFailure: false });
    const metrics = getTransformMetrics();
    expect(metrics.total).toBe(3);
    expect(metrics).toMatchObject({ scope: "current-instance", retentionWindowMinutes: 0 });
    expect(metrics.averageLatencyMs).toBe(1_333);
    expect(metrics.averageQueueWaitMs).toBe(40);
    expect(metrics.providerFailures).toBe(1);
    expect(metrics.queueThroughputPerMinute).toBe(1);
    expect(metrics.modeBreakdown.find(row => row.mode === "rewrite")).toMatchObject({ count: 1, accepted: 1 });
    expect(JSON.stringify(metrics)).not.toContain("inputText");
  });
});
