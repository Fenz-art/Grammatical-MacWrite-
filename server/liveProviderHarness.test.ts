import { describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveLiveTargets, runLiveCase, selectedLiveCases, writeLiveReports } from "./liveProviderHarness";
import { transformationFixtureManifest } from "./test-fixtures/transformations/v1";

describe("live provider harness configuration and safety", () => {
  it("resolves exact configured provider/model targets without exposing credentials", () => {
    const targets = resolveLiveTargets({
      GROQ_API_KEY: "synthetic-groq-secret", GROQ_MODEL: "qwen/test", GROQ_API_URL: "https://groq.example/v1",
      DEEPSEEK_API_KEY: "synthetic-deepseek-secret", DEEPSEEK_MODEL: "deepseek/test", DEEPSEEK_API_URL: "https://deepseek.example/v1",
      OPENROUTER_API_KEY: "synthetic-router-secret", OPENROUTER_API_URL: "https://router.example/api/v1",
      LLM_SECONDARY_MODEL: "ling/test", LLM_QUATERNARY_MODEL: "glm/test",
    });
    expect(targets.map(({ name, model, configured }) => ({ name, model, configured }))).toEqual([
      { name: "groq-qwen", model: "qwen/test", configured: true },
      { name: "ling", model: "ling/test", configured: true },
      { name: "deepseek", model: "deepseek/test", configured: true },
      { name: "glm", model: "glm/test", configured: true },
    ]);
    expect(targets.map(target => target.provider.apiKey)).toEqual(["synthetic-groq-secret", "synthetic-router-secret", "synthetic-deepseek-secret", "synthetic-router-secret"]);
  });

  it("reports missing model IDs and invalid endpoint configuration as sanitized diagnostics", () => {
    const targets = resolveLiveTargets({ GROQ_API_KEY: "private", GROQ_MODEL: "", GROQ_API_URL: "https://groq.example" });
    expect(targets[0]).toMatchObject({ configured: false, diagnostic: "MODEL_ID_REQUIRED", model: "" });
    const invalid = resolveLiveTargets({ GROQ_API_KEY: "private", GROQ_MODEL: "model", GROQ_API_URL: "http://provider.example" });
    expect(invalid[0]).toMatchObject({ configured: false, diagnostic: "ENDPOINT_INVALID" });
    expect(JSON.stringify(invalid)).not.toContain("private");
  });

  it("selects only bounded smoke fixtures and covers each mode", () => {
    const cases = selectedLiveCases("smoke", 2);
    expect(cases).toHaveLength(8);
    expect(new Set(cases.map(item => item.mode))).toEqual(new Set(["proofread", "improve", "natural", "rewrite"]));
    expect(cases.every(item => item.fixture.sizeClass !== "huge" && item.fixture.sizeClass !== "very-large")).toBe(true);
  });

  it("does not send a provider call when its configuration is absent", async () => {
    const target = resolveLiveTargets({})[0]!;
    const fixture = transformationFixtureManifest.fixtures[0]!;
    const result = await runLiveCase(target, fixture, "proofread", { remainingCases: 1, spentUsd: 0, maxCostUsd: 0.5 });
    expect(result).toMatchObject({ outcome: "skipped", failureCode: "MODEL_ID_REQUIRED", sourcePreserved: true });
    expect(JSON.stringify(result)).not.toContain(fixture.sourceText);
  });

  it("writes metadata-only JSON and Markdown reports", async () => {
    const directory = await mkdtemp(join(tmpdir(), "grammatical-live-report-"));
    try {
      const targets = resolveLiveTargets({ GROQ_API_KEY: "report-secret", GROQ_MODEL: "qwen/report", GROQ_API_URL: "https://private.example/api?token=do-not-report" });
      const fixture = transformationFixtureManifest.fixtures.find(item => item.id === "v1-mode-proofread-mechanical")!;
      await writeLiveReports([{
        fixtureId: fixture.id, provider: "groq-qwen", model: "qwen/report", mode: "proofread", sizeClass: "tiny", difficulty: 0,
        outcome: "accepted", sourcePreserved: true, latencyMs: 12,
      }], targets, "smoke", directory);
      const json = await readFile(join(directory, "live-provider-corpus-report.json"), "utf8");
      const markdown = await readFile(join(directory, "live-provider-corpus-report.md"), "utf8");
      for (const content of [json, markdown]) {
        expect(content).toContain(fixture.id);
        expect(content).not.toContain(fixture.sourceText);
        expect(content).not.toContain("report-secret");
        expect(content).not.toContain("private.example");
        expect(content).not.toContain("outputText");
      }
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
