import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { TransformationMode } from "../shared/transformations";
import { buildTransformMessages } from "./textTransform";
import { invokeLLM, LLMProviderError } from "./_core/llm";
import type { ProviderConfig } from "./_core/llmProviders";
import { parseStructuredDocument } from "../shared/structuredDocument";
import { scoreComplexity, outputTokenBudget } from "./_core/llmProviders";
import { transformationFixtureManifest, type TransformationFixture } from "./test-fixtures/transformations/v1";
import { transformEventStream } from "./transformStream";
import type { LlmUsage, TransformInput } from "../shared/transformations";

export type LiveTargetName = "groq-qwen" | "ling" | "deepseek" | "glm";
export type LiveFailureCode = "NOT_CONFIGURED" | "MODEL_ID_REQUIRED" | "ENDPOINT_INVALID" | "AUTHENTICATION_FAILED" | "RATE_LIMITED" | "CREDIT_OR_BUDGET_UNAVAILABLE" | "CONTEXT_LIMIT_EXCEEDED" | "PROVIDER_TIMEOUT" | "PROVIDER_UNAVAILABLE" | "MALFORMED_RESPONSE" | "EMPTY_CANDIDATE" | "SEMANTIC_REJECTION" | "STRUCTURE_REJECTION" | "UNICODE_REJECTION" | "OUTPUT_TRUNCATED" | "HARNESS_ERROR";

export type LiveTarget = { name: LiveTargetName; provider: ProviderConfig; model: string; configured: boolean; diagnostic?: LiveFailureCode };
export type LiveCaseResult = {
  fixtureId: string; provider: LiveTargetName; model: string; mode: TransformationMode; sizeClass: string; difficulty: number;
  outcome: "accepted" | "review-required" | "rejected" | "provider-error" | "skipped";
  failureStage?: string; failureCode?: LiveFailureCode; latencyMs?: number; promptTokens?: number; completionTokens?: number;
  reasoningTokens?: number; cachedTokens?: number; costUsd?: number; resolvedModel?: string; sourcePreserved: boolean;
  semanticRisk?: string; confidenceBucket?: "very-high" | "high" | "moderate" | "low" | "very-low"; checksFailed?: string[];
};

const validUrl = (value: string) => { try { const url = new URL(value); return url.protocol === "https:" || url.hostname === "localhost" || url.hostname === "127.0.0.1"; } catch { return false; } };
const trimUrl = (value: string) => value.replace(/\/+$/, "");
const config = (name: ProviderConfig["name"], url: string, key: string, model: string): ProviderConfig => {
  const provider: ProviderConfig = { name, baseUrl: trimUrl(url), apiKey: key || undefined, defaultModel: model.trim(), enabled: Boolean(key.trim() && model.trim() && validUrl(url)), timeoutMs: boundedNumber(process.env.LIVE_PROVIDER_TIMEOUT_MS, 45_000, 1_000, 180_000), maxRetries: 0, priority: 0 };
  // Keep endpoint details and credentials available to the request adapter but
  // out of accidental JSON serialization, test diagnostics, and reports.
  Object.defineProperties(provider, {
    baseUrl: { value: trimUrl(url), enumerable: false },
    apiKey: { value: key || undefined, enumerable: false },
  });
  return provider;
};
function boundedNumber(raw: string | undefined, fallback: number, min: number, max: number) { const parsed = Number(raw); return Number.isFinite(parsed) ? Math.max(min, Math.min(max, Math.floor(parsed))) : fallback; }

export function resolveLiveTargets(env: Record<string, string | undefined> = process.env): LiveTarget[] {
  const openUrl = env.OPENROUTER_API_URL ?? env.LLM_API_BASE_URL ?? "https://openrouter.ai/api/v1";
  const openKey = env.OPENROUTER_API_KEY ?? env.LLM_API_KEY ?? "";
  const lingProvider = env.LING_API_URL || env.LING_API_KEY ? config("custom", env.LING_API_URL ?? "", env.LING_API_KEY ?? "", env.LING_MODEL ?? "") : config("openrouter", openUrl, openKey, env.LING_MODEL ?? env.LLM_SECONDARY_MODEL ?? "");
  const glmProvider = env.GLM_API_URL || env.GLM_API_KEY ? config("custom", env.GLM_API_URL ?? "", env.GLM_API_KEY ?? "", env.GLM_MODEL ?? "") : config("openrouter", openUrl, openKey, env.GLM_MODEL ?? env.LLM_QUATERNARY_MODEL ?? "");
  const definitions: Array<{ name: LiveTargetName; provider: ProviderConfig; model: string }> = [
    { name: "groq-qwen", provider: config("groq", env.GROQ_API_URL ?? env.GROQ_API_BASE_URL ?? "https://api.groq.com/openai/v1", env.GROQ_API_KEY ?? "", env.GROQ_QWEN_MODEL ?? env.GROQ_MODEL ?? ""), model: env.GROQ_QWEN_MODEL ?? env.GROQ_MODEL ?? "" },
    { name: "ling", provider: lingProvider, model: env.LING_MODEL ?? env.LLM_SECONDARY_MODEL ?? "" },
    { name: "deepseek", provider: config("deepseek", env.DEEPSEEK_API_URL ?? env.DEEPSEEK_API_BASE_URL ?? "https://api.deepseek.com/v1", env.DEEPSEEK_API_KEY ?? "", env.DEEPSEEK_MODEL ?? ""), model: env.DEEPSEEK_MODEL ?? "" },
    { name: "glm", provider: glmProvider, model: env.GLM_MODEL ?? env.LLM_QUATERNARY_MODEL ?? "" },
  ];
  return definitions.map(item => ({ ...item, configured: item.provider.enabled, diagnostic: item.model.trim() ? item.provider.enabled ? undefined : validUrl(item.provider.baseUrl) ? "NOT_CONFIGURED" : "ENDPOINT_INVALID" : "MODEL_ID_REQUIRED" }));
}

export function selectedLiveCases(profile: string, maxPerMode: number): Array<{ fixture: TransformationFixture; mode: TransformationMode }> {
  const eligible = transformationFixtureManifest.fixtures.filter(f => f.proposedCandidate !== undefined);
  const regularIds: Record<TransformationMode, string[]> = {
    proofread: ["v1-mode-proofread-mechanical", "v1-size-small-mechanical"],
    improve: ["v1-semantic-technical-api", "v1-size-small-technical"],
    natural: ["v1-mode-natural-context", "v1-unicode-whitespace"],
    rewrite: ["v1-mode-rewrite-technical", "v1-github-pr-structure"],
  };
  const cases: Array<{ fixture: TransformationFixture; mode: TransformationMode }> = [];
  for (const mode of ["proofread", "improve", "natural", "rewrite"] as const) {
    const pool = profile === "long"
      ? eligible.filter(f => f.sizeClass === "large" || f.sizeClass === "very-large" || f.sizeClass === "huge")
      : eligible.filter(f => f.sizeClass !== "large" && f.sizeClass !== "very-large" && f.sizeClass !== "huge");
    let picked = regularIds[mode].map(id => pool.find(f => f.id === id)).filter((f): f is TransformationFixture => Boolean(f));
    if (profile === "long") picked = pool.filter(f => f.mode === mode).slice(0, maxPerMode);
    if (picked.length < maxPerMode) picked.push(...pool.filter(f => f.mode === mode && !picked.includes(f)).slice(0, maxPerMode - picked.length));
    cases.push(...picked.slice(0, maxPerMode).map(fixture => ({ fixture, mode })));
  }
  return cases;
}

function errorCode(error: unknown): LiveFailureCode {
  if (error instanceof LLMProviderError) {
    if (error.status === 401 || error.status === 403) return "AUTHENTICATION_FAILED";
    if (error.status === 402) return "CREDIT_OR_BUDGET_UNAVAILABLE";
    if (error.status === 429) return "RATE_LIMITED";
    if (error.status === 400 || error.status === 413) return "CONTEXT_LIMIT_EXCEEDED";
    return "PROVIDER_UNAVAILABLE";
  }
  if (error instanceof Error && /abort|timeout/i.test(error.name + error.message)) return "PROVIDER_TIMEOUT";
  return "PROVIDER_UNAVAILABLE";
}

export async function runLiveCase(target: LiveTarget, fixture: TransformationFixture, mode: TransformationMode, budget: { remainingCases: number; spentUsd: number; maxCostUsd: number }): Promise<LiveCaseResult> {
  const base = { fixtureId: fixture.id, provider: target.name, model: target.model || "", mode, sizeClass: fixture.sizeClass, difficulty: fixture.difficulty };
  if (!target.configured) return { ...base, outcome: "skipped", failureStage: "configuration", failureCode: target.diagnostic ?? "NOT_CONFIGURED", sourcePreserved: true };
  if (budget.remainingCases <= 0 || budget.spentUsd >= budget.maxCostUsd) return { ...base, outcome: "skipped", failureStage: "budget", failureCode: "CREDIT_OR_BUDGET_UNAVAILABLE", sourcePreserved: true };

  const source = fixture.sourceText;
  const structured = parseStructuredDocument(source);
  const intensity = mode === "proofread" ? "low" : fixture.intensity;
  const complexity = scoreComplexity({ document: structured, mode, intensity, protectedTerms: fixture.protectedTerms });
  const maxInputTokens = boundedNumber(process.env.LIVE_PROVIDER_MAX_INPUT_TOKENS, 8_000, 256, 100_000);
  if (complexity.features.estimatedInputTokens > maxInputTokens) return { ...base, outcome: "skipped", failureStage: "context-preflight", failureCode: "CONTEXT_LIMIT_EXCEEDED", sourcePreserved: true };
  const maxTokens = outputTokenBudget(complexity.features.estimatedInputTokens, mode, intensity, Math.min(1200, boundedNumber(process.env.LIVE_PROVIDER_MAX_OUTPUT_TOKENS, 900, 128, 2400)));
  const controller = new AbortController();
  const timeoutMs = target.provider.timeoutMs;
  const timer = setTimeout(() => controller.abort(new Error("PROVIDER_TIMEOUT")), timeoutMs);
  const started = performance.now();
  let providerError: unknown;
  let finishReason: string | null | undefined;
  try {
    const input: TransformInput = { requestId: `live-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, text: source, mode, intensity, protectedTerms: fixture.protectedTerms, codeCommentOnly: fixture.codeCommentOnly, clientRevision: 1 };
    const events = [];
    for await (const event of transformEventStream(input, controller.signal, async () => {
      try {
        const messages = buildTransformMessages(source, mode, intensity, { protectedTerms: fixture.protectedTerms, codeCommentOnly: fixture.codeCommentOnly });
        const response = await invokeLLM({ messages, model: target.model, maxCompletionTokens: maxTokens, signal: controller.signal }, target.provider);
        finishReason = response.choices?.[0]?.finish_reason;
        const content = response.choices?.[0]?.message?.content;
        const candidate = typeof content === "string" ? content.trim() : Array.isArray(content) ? content.filter(part => part.type === "text").map(part => part.text).join("").trim() : "";
        if (!candidate) throw new Error("EMPTY_CANDIDATE");
        const usage: LlmUsage = {
          promptTokens: response.usage?.prompt_tokens, completionTokens: response.usage?.completion_tokens,
          totalTokens: response.usage?.total_tokens, reasoningTokens: response.usage?.reasoning_tokens ?? response.usage?.completion_tokens_details?.reasoning_tokens,
          cachedTokens: response.usage?.prompt_tokens_details?.cached_tokens, costUsd: response.usage?.cost,
        };
        return { text: candidate, model: response.model || target.model, usage, provenance: [{ provider: target.provider.name, requestedModel: target.model, resolvedModel: response.model || target.model, routingTier: "default" as const }] };
      } catch (error) { providerError = error; throw error; }
    })) events.push(event);
    const final = events.at(-1);
    const latencyMs = Math.round(performance.now() - started);
    if (final?.type === "error") return { ...base, outcome: "provider-error", failureStage: "provider-request", failureCode: providerError instanceof Error && providerError.message === "EMPTY_CANDIDATE" ? "EMPTY_CANDIDATE" : providerError ? errorCode(providerError) : final.code === "DEADLINE_EXCEEDED" ? "PROVIDER_TIMEOUT" : "PROVIDER_UNAVAILABLE", latencyMs, sourcePreserved: true };
    if (final?.type === "rejected") {
      const failedChecks = final.checks.filter(check => !check.preserved).map(check => check.dimension);
      const failureCode: LiveFailureCode = failedChecks.some(check => check === "structure") ? "STRUCTURE_REJECTION" : failedChecks.some(check => check === "emoji-specialchar" || check === "whitespace") ? "UNICODE_REJECTION" : "SEMANTIC_REJECTION";
      return { ...base, outcome: "rejected", failureStage: "semantic-validation", failureCode, latencyMs, sourcePreserved: final.fallbackText === source, checksFailed: failedChecks };
    }
    if (final?.type !== "complete") return { ...base, outcome: "provider-error", failureStage: "stream-state", failureCode: "HARNESS_ERROR", latencyMs, sourcePreserved: true };
    const candidate = final.result.text;
    const failedChecks: string[] = [];
    if (candidate.length < source.length * 0.55 && source.length > 120) failedChecks.push("output-completeness");
    if (finishReason === "length") failedChecks.push("finish-reason-length");
    const failureCode: LiveFailureCode | undefined = failedChecks.length ? "OUTPUT_TRUNCATED" : undefined;
    const outcome = failureCode ? "rejected" : fixture.difficulty >= 3 || mode === "rewrite" || mode === "natural" ? "review-required" : "accepted";
    return {
      ...base, outcome, ...(failureCode ? { failureStage: "completeness-validation", failureCode } : {}),
      latencyMs: final.result.elapsedMs || latencyMs, sourcePreserved: true, semanticRisk: final.result.semanticRisks.some(risk => risk.severity === "warning") ? "warning" : "info",
      confidenceBucket: failureCode ? "very-low" : fixture.difficulty === 0 && mode === "proofread" ? "very-high" : fixture.difficulty <= 1 && mode !== "rewrite" ? "high" : fixture.difficulty >= 4 ? "moderate" : "low",
      checksFailed: failedChecks,
      promptTokens: final.result.usage?.promptTokens, completionTokens: final.result.usage?.completionTokens, reasoningTokens: final.result.usage?.reasoningTokens,
      cachedTokens: final.result.usage?.cachedTokens, costUsd: final.result.usage?.costUsd, resolvedModel: final.result.provenance?.[0]?.resolvedModel,
    };
  } catch (error) {
    return { ...base, outcome: "provider-error", failureStage: "provider-request", failureCode: errorCode(error), latencyMs: Math.round(performance.now() - started), sourcePreserved: true };
  } finally { clearTimeout(timer); }
}

export async function writeLiveReports(results: LiveCaseResult[], targets: LiveTarget[], profile: string, outputDirectory = process.env.LIVE_PROVIDER_OUTPUT_DIR || "artifacts/live-provider-tests") {
  const directory = resolve(outputDirectory);
  const providers = targets.map(target => {
    const rows = results.filter(row => row.provider === target.name);
    const latencies = rows.map(row => row.latencyMs).filter((x): x is number => x !== undefined).sort((a,b)=>a-b);
    const sum = (field: "promptTokens" | "completionTokens" | "reasoningTokens" | "cachedTokens" | "costUsd") => { const values = rows.map(row => row[field]).filter((value): value is number => value !== undefined); return values.length ? values.reduce((n, value) => n + value, 0) : undefined; };
    return { provider: target.name, model: target.model || "", configured: target.configured, configurationDiagnostic: target.diagnostic, attemptedCases: rows.filter(r=>r.outcome!=="skipped").length,
      accepted: rows.filter(r=>r.outcome==="accepted").length, reviewRequired: rows.filter(r=>r.outcome==="review-required").length, rejected: rows.filter(r=>r.outcome==="rejected").length,
      providerErrors: rows.filter(r=>r.outcome==="provider-error").length, skipped: rows.filter(r=>r.outcome==="skipped").length,
      totalPromptTokens: sum("promptTokens"), totalCompletionTokens: sum("completionTokens"), totalReasoningTokens: sum("reasoningTokens"), totalCachedTokens: sum("cachedTokens"), totalCostUsd: sum("costUsd"),
      p50LatencyMs: latencies.length ? latencies[Math.floor((latencies.length-1)*.5)] : undefined, p95LatencyMs: latencies.length ? latencies[Math.floor((latencies.length-1)*.95)] : undefined };
  });
  const json = { runId: `live-${Date.now()}`, startedAt: new Date().toISOString(), completedAt: new Date().toISOString(), profile, providers, cases: results };
  const repeatedSafetyFailures = targets.some(target => results.filter(r => r.provider === target.name && r.outcome === "rejected").length > 1);
  const hasIssues = results.some(r => r.outcome === "rejected" || r.outcome === "provider-error" || r.outcome === "skipped");
  const decision = repeatedSafetyFailures ? "BLOCKED — repeated semantic or structure guard failures found" : hasIssues ? "CONDITIONAL — provider failures, skipped cases, or guard rejections require review" : "CONDITIONAL — deterministic safety checks pass; human quality evaluation remains required";
  const md = [`# Live provider corpus report`, ``, `- Profile: ${profile}`, `- Release decision: ${decision}`, ``, `## Provider results`, ``, `| Provider/model | Configured | Accepted | Review | Rejected | Errors | Skipped | p50 ms | p95 ms | Cost USD |`, `|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|`, ...providers.map(p=>`| ${p.provider}/${p.model || "MODEL_ID_REQUIRED"} | ${p.configured} | ${p.accepted} | ${p.reviewRequired} | ${p.rejected} | ${p.providerErrors} | ${p.skipped} | ${p.p50LatencyMs ?? "—"} | ${p.p95LatencyMs ?? "—"} | ${p.totalCostUsd ?? "unknown"} |`), ``, `## Cases`, ``, `| Fixture | Provider/model | Mode | Size | Difficulty | Outcome | Failure | Latency ms | Tokens (in/out/reasoning) | Cost USD |`, `|---|---|---|---|---:|---|---|---:|---|---:|`, ...results.map(r=>`| ${r.fixtureId} | ${r.provider}/${r.model || "—"} | ${r.mode} | ${r.sizeClass} | ${r.difficulty} | ${r.outcome} | ${r.failureCode ?? "—"} | ${r.latencyMs ?? "—"} | ${r.promptTokens ?? "?"}/${r.completionTokens ?? "?"}/${r.reasoningTokens ?? "?"} | ${r.costUsd ?? "?"} |`), ``].join("\n");
  await mkdir(directory, { recursive: true });
  await Promise.all([writeFile(resolve(directory, "live-provider-corpus-report.json"), JSON.stringify(json, null, 2), { mode: 0o600 }), writeFile(resolve(directory, "live-provider-corpus-report.md"), md, { mode: 0o600 })]);
}

export const LIVE_MODES: TransformationMode[] = ["proofread", "improve", "natural", "rewrite"];
