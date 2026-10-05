import { beforeEach, describe, expect, it, vi } from "vitest";
import { chooseRoute, outputTokenBudget, resolveLLMSettings, scoreComplexity, type ComplexityScore, type ProviderSettings } from "./_core/llmProviders";
import { transformEventStream } from "./transformStream";
import { runSemanticGuard } from "./semanticGuard";
import { assessStructurePreservation } from "../shared/structuredDocument";
import { splitPasteBlocks } from "../shared/pasteBlocks";
import { MAX_TRANSFORM_BLOCK_CHARS } from "../shared/pasteBlocks";
import { transformationFixtureManifest, type FailureCategory, type TransformationFixture } from "./test-fixtures/transformations/v1";

vi.mock("./transformMetrics", () => ({ recordTransformMetric: vi.fn() }));
vi.mock("./transformAdmission", () => ({ releaseTransformLease: vi.fn(async () => undefined) }));

const diagnosticCategories = (fixture: TransformationFixture, candidate: string): FailureCategory[] => {
  if (!candidate.trim()) return ["malformed-candidate"];
  const failures = new Set<FailureCategory>();
  if (fixture.sourceText.length > 80 && candidate.length < fixture.sourceText.length * 0.65) failures.add("source-corruption");
  const structure = assessStructurePreservation(fixture.sourceText, candidate, { transformCodeComments: fixture.codeCommentOnly });
  if (!structure.preserved) failures.add("structure-preservation");
  const semantic = runSemanticGuard(fixture.sourceText, candidate, fixture.protectedTerms, undefined, fixture.codeCommentOnly);
  for (const check of semantic.checks) {
    if (check.preserved) continue;
    if (check.dimension === "structure") failures.add("structure-preservation");
    else if (check.dimension === "emoji-specialchar" || check.dimension === "whitespace") failures.add("unicode-whitespace");
    else failures.add("semantic-validation");
  }
  return [...failures];
};

function makeComplexity(bucket: ComplexityScore["bucket"], score = 0, crossSentenceReferenceSignals = 0): ComplexityScore {
  return {
    score,
    bucket,
    reasons: [],
    features: { crossSentenceReferenceSignals } as ComplexityScore["features"],
  };
}

function makeRoutingSettings(): ProviderSettings {
  return resolveLLMSettings({
    LLM_API_BASE_URL: "https://openrouter.ai/api/v1",
    LLM_API_KEY: "synthetic-openrouter-key",
    LLM_MODEL: "z-ai/glm-5.3-flash",
    GROQ_API_BASE_URL: "https://api.groq.com/openai/v1",
    GROQ_API_KEY: "synthetic-groq-key",
    GROQ_MODEL: "qwen/qwen3.8-27b",
    DEEPSEEK_API_BASE_URL: "https://api.deepseek.com/v1",
    DEEPSEEK_API_KEY: "synthetic-deepseek-key",
    DEEPSEEK_MODEL: "deepseek-reasoner",
    LLM_DEFAULT_PROVIDER: "groq",
    LLM_DEFAULT_MODEL: "qwen/qwen3.8-27b",
    LLM_SECONDARY_PROVIDER: "openrouter",
    LLM_SECONDARY_MODEL: "inclusionai/ling-3.1-flash",
    LLM_TERTIARY_PROVIDER: "deepseek",
    LLM_TERTIARY_MODEL: "deepseek-reasoner",
    LLM_QUATERNARY_PROVIDER: "openrouter",
    LLM_QUATERNARY_MODEL: "z-ai/glm-5.3-flash",
  });
}

const routingSettings = makeRoutingSettings();

beforeEach(() => vi.clearAllMocks());

describe("versioned synthetic transformation fixture corpus", () => {
  it("has unique fixture IDs and covers all modes, sizes, difficulty levels, reasoning labels, and content classes", () => {
    const fixtures = transformationFixtureManifest.fixtures;
    expect(transformationFixtureManifest.schemaVersion).toBe(1);
    expect(new Set(fixtures.map(fixture => fixture.id)).size).toBe(fixtures.length);
    expect(new Set(fixtures.map(fixture => fixture.mode))).toEqual(new Set(["proofread", "improve", "natural", "rewrite"]));
    expect(new Set(fixtures.map(fixture => fixture.sizeClass))).toEqual(new Set(["tiny", "small", "medium", "large", "very-large", "huge"]));
    expect(new Set(fixtures.map(fixture => fixture.difficulty))).toEqual(new Set([0, 1, 2, 3, 4, 5]));
    expect(new Set(fixtures.map(fixture => fixture.reasoningRequirement))).toEqual(new Set(["none", "low", "moderate", "high", "structured"]));
    for (const contentClass of ["clean", "mechanical", "context", "technical", "markdown", "unicode", "failure-injection"]) {
      expect(fixtures.some(fixture => fixture.id.endsWith(`-${contentClass}`))).toBe(true);
    }
    expect(fixtures.every(fixture => fixture.sourceText.length > 0 && fixture.title.length > 0)).toBe(true);
    expect(fixtures.some(fixture => /[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/.test(fixture.sourceText))).toBe(false);
    expect(JSON.stringify(fixtures)).not.toMatch(/sk-[A-Za-z0-9]{12,}|gsk_[A-Za-z0-9]{12,}/);
  });

  it("keeps plain-prose size fixtures within their declared word bands", () => {
    const plain = transformationFixtureManifest.fixtures.filter(fixture => fixture.id.startsWith("v1-size-") && fixture.id.endsWith("-clean"));
    const wordCount = (text: string) => (text.match(/\S+/g) ?? []).length;
    const bands: Record<string, [number, number]> = {
      tiny: [1, 80],
      small: [81, 300],
      medium: [301, 1_000],
      large: [1_001, 3_000],
      "very-large": [3_001, 8_000],
      huge: [8_001, Number.MAX_SAFE_INTEGER],
    };
    for (const fixture of plain) {
      const [minimum, maximum] = bands[fixture.sizeClass]!;
      expect(wordCount(fixture.sourceText), `${fixture.id} word count`).toBeGreaterThanOrEqual(minimum);
      expect(wordCount(fixture.sourceText), `${fixture.id} word count`).toBeLessThanOrEqual(maximum);
    }
  });

  it("diagnoses expected candidate outcomes against semantic and structural contracts", () => {
    const results = transformationFixtureManifest.fixtures
      .filter(fixture => fixture.proposedCandidate !== undefined)
      .map(fixture => {
        const candidate = fixture.proposedCandidate!;
        const failures = diagnosticCategories(fixture, candidate);
        const outcome = failures.length ? "rejected" : "accepted";
        return { fixture, outcome, failures };
      });
    const mismatches = results.filter(result => result.outcome !== result.fixture.expectedOutcome);
    expect(mismatches.map(result => ({ id: result.fixture.id, expected: result.fixture.expectedOutcome, actual: result.outcome, failures: result.failures }))).toEqual([]);
    expect(results.find(result => result.fixture.id === "v1-adversarial-number-drift")?.failures).toContain("semantic-validation");
  });

  it("classifies malformed and truncated candidates instead of reporting only a generic failure", () => {
    const source = transformationFixtureManifest.fixtures.find(fixture => fixture.id === "v1-size-medium-clean")!;
    expect(diagnosticCategories(source, "   ")).toEqual(["malformed-candidate"]);
    expect(diagnosticCategories(source, "PostgreSQL processes event 1 safely.")).toContain("source-corruption");
  });

  it("preserves every synthetic paste block in order through the configured block boundary", () => {
    const huge = transformationFixtureManifest.fixtures.find(fixture => fixture.id === "v1-size-huge-clean")!;
    const blocks = splitPasteBlocks(huge.sourceText, MAX_TRANSFORM_BLOCK_CHARS);
    expect(blocks.length).toBeGreaterThan(1);
    expect(blocks.map(block => block.text).join("")).toBe(huge.sourceText);
    expect(Math.max(...blocks.map(block => block.charCount))).toBeLessThanOrEqual(MAX_TRANSFORM_BLOCK_CHARS);
    expect(blocks.every(block => !block.text.includes("\uFFFD"))).toBe(true);
  });

  it("uses the ordered model tiers without invoking a live provider", () => {
    const route = (complexity: ComplexityScore) => chooseRoute(routingSettings, complexity, { inputTokens: 500, outputTokens: 400 });
    expect(route(makeComplexity("small"))).toMatchObject({ provider: "groq", model: "qwen/qwen3.8-27b", tier: "default" });
    expect(route(makeComplexity("ordinary"))).toMatchObject({ provider: "openrouter", model: "inclusionai/ling-3.1-flash", tier: "secondary" });
    expect(route(makeComplexity("ordinary", 20, 3))).toMatchObject({ provider: "deepseek", model: "deepseek-reasoner", tier: "tertiary" });
    expect(route(makeComplexity("large"))).toMatchObject({ provider: "deepseek", model: "deepseek-reasoner", tier: "tertiary" });
    expect(route(makeComplexity("difficult"))).toMatchObject({ provider: "openrouter", model: "z-ai/glm-5.3-flash", tier: "quaternary" });
  });

  it("keeps trivial proofreading budgets below high-intensity rewrite budgets", () => {
    // Above the provider's 256-token floor so this checks the mode multiplier
    // rather than comparing two budgets clamped to the same minimum.
    expect(outputTokenBudget(400, "proofread", "low", 2_400)).toBeLessThan(outputTokenBudget(400, "rewrite", "high", 2_400));
  });

  it("runs stream acceptance, rejection, and timeout fixtures with an injected candidate generator only", async () => {
    // Stream state transitions are integration-tested with bounded candidates;
    // huge documents are covered by the independent split/reconstruction test.
    const fixtures = transformationFixtureManifest.fixtures.filter(fixture =>
      (fixture.expectedOutcome === "accepted" || fixture.expectedOutcome === "rejected" || fixture.expectedOutcome === "error")
      && (fixture.sizeClass === "tiny" || fixture.sizeClass === "small"),
    );
    for (const fixture of fixtures) {
      const events = [];
      const input = { requestId: fixture.id, text: fixture.sourceText, mode: fixture.mode, intensity: fixture.intensity, protectedTerms: fixture.protectedTerms, codeCommentOnly: fixture.codeCommentOnly, clientRevision: 1 };
      const generator = async () => {
        if (fixture.expectedOutcome === "error") throw new Error("synthetic provider timeout");
        return { text: fixture.proposedCandidate ?? fixture.sourceText, model: "synthetic/mock", provenance: [], usage: {} };
      };
      for await (const event of transformEventStream(input, undefined, generator)) events.push(event);
      const finalEvent = events.at(-1);
      if (fixture.expectedOutcome === "accepted") expect(finalEvent, fixture.id).toMatchObject({ type: "complete", result: { validationStatus: "accepted" } });
      else if (fixture.expectedOutcome === "rejected") expect(finalEvent, fixture.id).toMatchObject({ type: "rejected", fallbackText: fixture.sourceText });
      else expect(finalEvent, fixture.id).toMatchObject({ type: "error", code: "SERVICE_UNAVAILABLE", retryable: true });
      expect(JSON.stringify(events), `${fixture.id} must not expose a credential`).not.toMatch(/sk-[A-Za-z0-9]{12,}|gsk_[A-Za-z0-9]{12,}/);
    }
  });
});
