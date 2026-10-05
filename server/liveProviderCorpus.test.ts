import { describe, expect, it, vi } from "vitest";
import { config as loadPrivateEnvironment } from "dotenv";
import { LIVE_MODES, resolveLiveTargets, runLiveCase, selectedLiveCases, writeLiveReports, type LiveCaseResult } from "./liveProviderHarness";

vi.mock("./transformMetrics", () => ({ recordTransformMetric: vi.fn() }));
vi.mock("./transformAdmission", () => ({ releaseTransformLease: vi.fn(async () => undefined) }));

// Capture the opt-in before loading .env: only an explicit invocation-time
// environment variable may enable live calls, never a checked-in/default .env.
const explicitOptIn = process.env.RUN_LIVE_PROVIDER_TESTS;
loadPrivateEnvironment({ quiet: true });
const enabled = explicitOptIn === "true";
const live = enabled ? describe : describe.skip;

live("opt-in live provider corpus", () => {
  const targets = resolveLiveTargets();
  const profile = process.env.LIVE_PROVIDER_TEST_PROFILE ?? "smoke";
  const defaultPerMode = profile === "long" || profile === "standard" ? 5 : 2;
  const requestedPerMode = Number(process.env.LIVE_PROVIDER_MAX_CASES_PER_MODE ?? defaultPerMode);
  const maxPerMode = Number.isFinite(requestedPerMode) ? Math.max(1, Math.min(20, Math.floor(requestedPerMode))) : defaultPerMode;
  const selected = selectedLiveCases(profile, maxPerMode);
  const filters = new Set((process.env.LIVE_PROVIDER_FILTER ?? "").split(",").map(value => value.trim()).filter(Boolean));
  const activeTargets = targets.filter(target => !filters.size || filters.has(target.name));
  const defaultTotal = selected.length * activeTargets.length;
  const maxTotal = Number(process.env.LIVE_PROVIDER_MAX_TOTAL_CASES ?? 0) || defaultTotal;
  const maxCost = Number(process.env.LIVE_PROVIDER_MAX_COST_USD ?? 0.5);
  const results: LiveCaseResult[] = [];

  it("runs selected synthetic cases sequentially and applies the existing safety guards", async () => {
    let estimatedSpent = 0;
    let attempted = 0;
    const stopAfterBudget = () => attempted >= maxTotal || estimatedSpent >= maxCost;
    for (const target of activeTargets) {
      if (!target.configured) {
        for (const { fixture, mode } of selected) results.push(await runLiveCase(target, fixture, mode, { remainingCases: maxTotal - attempted, spentUsd: estimatedSpent, maxCostUsd: maxCost }));
        continue;
      }
      for (const { fixture, mode } of selected) {
        const inputEstimate = Math.ceil(fixture.sourceText.length / 4);
        const outputEstimate = Math.min(900, Math.ceil(fixture.sourceText.length / 3));
        const estimatedCallCost = (inputEstimate * Number(process.env.LIVE_PROVIDER_ESTIMATED_INPUT_USD_PER_MILLION ?? 5) + outputEstimate * Number(process.env.LIVE_PROVIDER_ESTIMATED_OUTPUT_USD_PER_MILLION ?? 20)) / 1_000_000;
        if (stopAfterBudget() || estimatedSpent + estimatedCallCost > maxCost) {
          results.push({ fixtureId: fixture.id, provider: target.name, model: target.model, mode, sizeClass: fixture.sizeClass, difficulty: fixture.difficulty, outcome: "skipped", failureStage: "budget", failureCode: "CREDIT_OR_BUDGET_UNAVAILABLE", sourcePreserved: true });
          continue;
        }
        attempted += 1;
        const result = await runLiveCase(target, fixture, mode, { remainingCases: maxTotal - attempted + 1, spentUsd: estimatedSpent, maxCostUsd: maxCost });
        results.push(result);
        if (result.costUsd !== undefined) estimatedSpent += result.costUsd;
        else {
          const inputRate = Number(process.env.LIVE_PROVIDER_ESTIMATED_INPUT_USD_PER_MILLION ?? 5);
          const outputRate = Number(process.env.LIVE_PROVIDER_ESTIMATED_OUTPUT_USD_PER_MILLION ?? 20);
          const inTokens = result.promptTokens ?? inputEstimate;
          const outTokens = result.completionTokens ?? outputEstimate;
          estimatedSpent += (inTokens * inputRate + outTokens * outputRate) / 1_000_000;
        }
      }
    }
    await writeLiveReports(results, targets, profile);
    const safetyViolations = results.filter(result => result.outcome === "rejected");
    const repeatedViolations = activeTargets.filter(target => safetyViolations.filter(result => result.provider === target.name).length > 1);
    expect(repeatedViolations, `Repeated semantic or structure guard failures: ${repeatedViolations.join(", ")}`).toEqual([]);
    expect(results.every(result => result.sourcePreserved)).toBe(true);
  }, 30 * 60_000);

});

if (!enabled) {
  describe("live provider corpus opt-in gate", () => {
    it("does not make provider calls unless RUN_LIVE_PROVIDER_TESTS=true", () => {
      expect(enabled).toBe(false);
      expect(LIVE_MODES).toEqual(["proofread", "improve", "natural", "rewrite"]);
    });
  });
}
