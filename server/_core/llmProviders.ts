import type { TransformationIntensity, TransformationMode } from "../../shared/transformations";
import { inferPassageSemanticContext } from "../../shared/semanticContext";
import { graphemeLength } from "../../shared/unicodeText";
import { parseStructuredDocument, type StructuredDocument } from "../../shared/structuredDocument";
import { ENV } from "./env";

export type LlmProviderName = "groq" | "deepseek" | "openrouter" | "ollama" | "custom";
export type RoutingTier = "default" | "secondary" | "tertiary" | "quaternary";
export type ComplexityBucket = "small" | "ordinary" | "large" | "difficult";

export type ProviderConfig = {
  name: LlmProviderName;
  enabled: boolean;
  baseUrl: string;
  apiKey?: string;
  defaultModel: string;
  timeoutMs: number;
  maxRetries: number;
  priority: number;
  httpReferer?: string;
  xTitle?: string;
};

export type RoutingConfig = {
  enabled: boolean;
  defaultProvider: LlmProviderName;
  secondaryProvider: LlmProviderName;
  tertiaryProvider: LlmProviderName;
  quaternaryProvider: LlmProviderName;
  defaultModel?: string;
  secondaryModel?: string;
  tertiaryModel?: string;
  quaternaryModel?: string;
  maxEstimatedCostPerRequestUsd?: number;
  maxEstimatedInputTokens: number;
  maxEstimatedOutputTokens: number;
  allowProviderFallback: boolean;
  allowOpenRouterInternalRouting: boolean;
};

export type ProviderSettings = {
  providers: ProviderConfig[];
  routing: RoutingConfig;
};

export type ComplexityFeatures = {
  graphemeCount: number;
  estimatedInputTokens: number;
  sentenceCount: number;
  paragraphCount: number;
  lineCount: number;
  proseCharacterCount: number;
  codeCharacterCount: number;
  protectedRegionCount: number;
  markdownNodeCount: number;
  tableCount: number;
  fencedCodeBlockCount: number;
  listItemCount: number;
  urlCount: number;
  identifierCount: number;
  unicodeComplexity: number;
  ambiguitySignals: number;
  crossSentenceReferenceSignals: number;
  semanticEntityCount: number;
  relationCount: number;
  mode: TransformationMode;
  intensity: TransformationIntensity;
};

export type ComplexityScore = {
  score: number;
  bucket: ComplexityBucket;
  reasons: string[];
  features: ComplexityFeatures;
};

export type RoutingDecision = {
  provider: LlmProviderName;
  model: string;
  tier: RoutingTier;
  reasonCodes: string[];
  estimatedPromptTokens: number;
  estimatedOutputTokens: number;
  estimatedCostUsd?: number;
  fallbackProviders: Array<{ provider: LlmProviderName; model: string; tier: RoutingTier }>;
};

export type RoutingInput = {
  document: StructuredDocument;
  mode: TransformationMode;
  intensity: TransformationIntensity;
  protectedTerms?: string[];
};

const PROVIDER_ORDER: LlmProviderName[] = ["groq", "deepseek", "openrouter", "ollama", "custom"];
const VALID_PROVIDERS = new Set<LlmProviderName>(PROVIDER_ORDER);
const ROUTING_THRESHOLDS = { smallInputTokens: 800, ordinaryInputTokens: 3_000, largeInputTokens: 8_000, difficultInputTokens: 16_000 } as const;
const DEFAULT_TIMEOUT_MS = 45_000;
const DEFAULT_MAX_RETRIES = 2;

function parseProviderName(value: string): LlmProviderName {
  const normalized = value.trim().toLowerCase() as LlmProviderName;
  if (!VALID_PROVIDERS.has(normalized)) throw new Error("LLM_ROUTING_PROVIDER_INVALID");
  return normalized;
}

function makeProvider(name: LlmProviderName, baseUrl: string, apiKey: string, defaultModel: string, priority: number): ProviderConfig {
  const enabled = Boolean(apiKey.trim() && defaultModel.trim());
  const normalizedBase = baseUrl.trim().replace(/\/+$/, "");
  if (enabled) {
    let parsed: URL;
    try { parsed = new URL(normalizedBase); } catch { throw new Error(`LLM_PROVIDER_URL_INVALID:${name}`); }
    if (parsed.protocol !== "https:" && parsed.hostname !== "localhost" && parsed.hostname !== "127.0.0.1") {
      throw new Error(`LLM_PROVIDER_URL_INVALID:${name}`);
    }
  }
  return { name, enabled, baseUrl: normalizedBase, apiKey: apiKey || undefined, defaultModel: defaultModel.trim(), timeoutMs: DEFAULT_TIMEOUT_MS, maxRetries: DEFAULT_MAX_RETRIES, priority };
}

export function resolveLLMProviders(environment: Record<string, string | undefined>): Array<{ name: LlmProviderName; baseUrl: string; apiKey: string; model: string }> {
  const openRouterBase = environment.OPENROUTER_API_URL ?? environment.LLM_API_BASE_URL ?? "https://openrouter.ai/api/v1";
  const openRouterKey = environment.OPENROUTER_API_KEY ?? environment.LLM_API_KEY ?? "";
  const openRouterModel = environment.OPENROUTER_MODEL ?? environment.LLM_MODEL ?? "";
  const openRouter = { name: "openrouter" as const, baseUrl: openRouterBase.trim().replace(/\/+$/, ""), apiKey: openRouterKey.trim(), model: openRouterModel.trim() };
  if (!openRouter.apiKey && !openRouter.model) {
    throw new Error("PROVIDER_NOT_CONFIGURED");
  }
  if (!openRouter.baseUrl || !openRouter.apiKey || !openRouter.model) {
    throw new Error("PROVIDER_NOT_CONFIGURED:OPENROUTER_INCOMPLETE");
  }
  let parsed: URL;
  try { parsed = new URL(openRouter.baseUrl); } catch { throw new Error("PROVIDER_NOT_CONFIGURED:OPENROUTER_INVALID_URL"); }
  if (parsed.protocol !== "https:" && parsed.hostname !== "localhost" && parsed.hostname !== "127.0.0.1") {
    throw new Error("PROVIDER_NOT_CONFIGURED:OPENROUTER_INVALID_URL");
  }

  const groqBase = environment.GROQ_API_URL ?? environment.GROQ_API_BASE_URL ?? "https://api.groq.com/openai/v1";
  const groqKey = (environment.GROQ_API_KEY ?? "").trim();
  const groqModel = (environment.GROQ_MODEL ?? "").trim();
  if (groqKey || groqModel) {
    if (!groqBase || !groqKey || !groqModel) {
      throw new Error("PROVIDER_NOT_CONFIGURED:GROQ_INCOMPLETE");
    }
    let parsedGroq: URL;
    try { parsedGroq = new URL(groqBase.trim().replace(/\/+$/, "")); } catch { throw new Error("PROVIDER_NOT_CONFIGURED:GROQ_INVALID_URL"); }
    if (parsedGroq.protocol !== "https:" && parsedGroq.hostname !== "localhost" && parsedGroq.hostname !== "127.0.0.1") {
      throw new Error("PROVIDER_NOT_CONFIGURED:GROQ_INVALID_URL");
    }
  }

  const deepseekBase = environment.DEEPSEEK_API_URL ?? environment.DEEPSEEK_API_BASE_URL ?? "https://api.deepseek.com/v1";
  const deepseekKey = (environment.DEEPSEEK_API_KEY ?? "").trim();
  const deepseekModel = (environment.DEEPSEEK_MODEL ?? "").trim();
  if (deepseekKey || deepseekModel) {
    if (!deepseekBase || !deepseekKey || !deepseekModel) {
      throw new Error("PROVIDER_NOT_CONFIGURED:DEEPSEEK_INCOMPLETE");
    }
    let parsedDeepseek: URL;
    try { parsedDeepseek = new URL(deepseekBase.trim().replace(/\/+$/, "")); } catch { throw new Error("PROVIDER_NOT_CONFIGURED:DEEPSEEK_INVALID_URL"); }
    if (parsedDeepseek.protocol !== "https:" && parsedDeepseek.hostname !== "localhost" && parsedDeepseek.hostname !== "127.0.0.1") {
      throw new Error("PROVIDER_NOT_CONFIGURED:DEEPSEEK_INVALID_URL");
    }
  }

  const providers: Array<{ name: LlmProviderName; baseUrl: string; apiKey: string; model: string }> = [openRouter];
  if (groqKey && groqModel) providers.push({ name: "groq", baseUrl: groqBase.trim().replace(/\/+$/, ""), apiKey: groqKey, model: groqModel });
  if (deepseekKey && deepseekModel) providers.push({ name: "deepseek", baseUrl: deepseekBase.trim().replace(/\/+$/, ""), apiKey: deepseekKey, model: deepseekModel });
  return providers;
}

export function resolveLLMSettings(environment: Record<string, string | undefined>): ProviderSettings {
  const openRouterBase = environment.OPENROUTER_API_URL ?? environment.LLM_API_BASE_URL ?? "https://openrouter.ai/api/v1";
  const openRouterKey = environment.OPENROUTER_API_KEY ?? environment.LLM_API_KEY ?? "";
  const openRouterModel = environment.OPENROUTER_MODEL ?? environment.LLM_MODEL ?? environment.LLM_SECONDARY_MODEL ?? environment.LLM_TERTIARY_MODEL ?? environment.LLM_QUATERNARY_MODEL ?? "";
  const providers = [
    makeProvider("groq", environment.GROQ_API_URL ?? environment.GROQ_API_BASE_URL ?? "https://api.groq.com/openai/v1", environment.GROQ_API_KEY ?? "", environment.GROQ_MODEL ?? "", 0),
    makeProvider("deepseek", environment.DEEPSEEK_API_URL ?? environment.DEEPSEEK_API_BASE_URL ?? "https://api.deepseek.com/v1", environment.DEEPSEEK_API_KEY ?? "", environment.DEEPSEEK_MODEL ?? "", 1),
    {
      ...makeProvider("openrouter", openRouterBase, openRouterKey, openRouterModel, 2),
      httpReferer: environment.OPENROUTER_HTTP_REFERER?.trim() || undefined,
      xTitle: environment.OPENROUTER_X_TITLE?.trim() || "Grammatical MacWrite",
    },
  ];
  const inputCap = Number(environment.LLM_MAX_ESTIMATED_INPUT_TOKENS ?? 40_000);
  const outputCap = Number(environment.LLM_MAX_ESTIMATED_OUTPUT_TOKENS ?? 2_400);
  const costCap = environment.LLM_MAX_ESTIMATED_COST_USD ? Number(environment.LLM_MAX_ESTIMATED_COST_USD) : undefined;
  const routing: RoutingConfig = {
    enabled: environment.LLM_ROUTING_ENABLED !== "false",
    defaultProvider: parseProviderName(environment.LLM_DEFAULT_PROVIDER ?? "groq"),
    secondaryProvider: parseProviderName(environment.LLM_SECONDARY_PROVIDER ?? "deepseek"),
    tertiaryProvider: parseProviderName(environment.LLM_TERTIARY_PROVIDER ?? "openrouter"),
    quaternaryProvider: parseProviderName(environment.LLM_QUATERNARY_PROVIDER ?? "openrouter"),
    defaultModel: environment.LLM_DEFAULT_MODEL?.trim() || undefined,
    secondaryModel: environment.LLM_SECONDARY_MODEL?.trim() || undefined,
    tertiaryModel: environment.LLM_TERTIARY_MODEL?.trim() || undefined,
    quaternaryModel: environment.LLM_QUATERNARY_MODEL?.trim() || undefined,
    maxEstimatedCostPerRequestUsd: Number.isFinite(costCap) ? costCap : undefined,
    maxEstimatedInputTokens: Number.isFinite(inputCap) && inputCap > 0 ? Math.floor(inputCap) : 40_000,
    maxEstimatedOutputTokens: Number.isFinite(outputCap) && outputCap > 0 ? Math.floor(outputCap) : 2_400,
    allowProviderFallback: environment.LLM_ALLOW_PROVIDER_FALLBACK !== "false",
    allowOpenRouterInternalRouting: environment.LLM_ALLOW_OPENROUTER_INTERNAL_ROUTING !== "false",
  };
  return { providers, routing };
}

export function resolveConfiguredLLMSettings(): ProviderSettings {
  return resolveLLMSettings({
    LLM_ROUTING_ENABLED: String(ENV.llmRoutingEnabled),
    LLM_DEFAULT_PROVIDER: ENV.llmDefaultProvider,
    LLM_SECONDARY_PROVIDER: ENV.llmSecondaryProvider,
    LLM_TERTIARY_PROVIDER: ENV.llmTertiaryProvider,
    LLM_QUATERNARY_PROVIDER: ENV.llmQuaternaryProvider,
    LLM_DEFAULT_MODEL: ENV.llmDefaultModel,
    LLM_SECONDARY_MODEL: ENV.llmSecondaryModel,
    LLM_TERTIARY_MODEL: ENV.llmTertiaryModel,
    LLM_QUATERNARY_MODEL: ENV.llmQuaternaryModel,
    LLM_ALLOW_PROVIDER_FALLBACK: String(ENV.llmAllowProviderFallback),
    LLM_MAX_ESTIMATED_INPUT_TOKENS: String(ENV.llmMaxEstimatedInputTokens),
    LLM_MAX_ESTIMATED_OUTPUT_TOKENS: String(ENV.llmMaxEstimatedOutputTokens),
    LLM_MAX_ESTIMATED_COST_USD: ENV.llmMaxEstimatedCostUsd === undefined ? undefined : String(ENV.llmMaxEstimatedCostUsd),
    GROQ_API_URL: ENV.groqApiBaseUrl,
    GROQ_API_KEY: ENV.groqApiKey,
    GROQ_MODEL: ENV.groqModel,
    DEEPSEEK_API_URL: ENV.deepseekApiBaseUrl,
    DEEPSEEK_API_KEY: ENV.deepseekApiKey,
    DEEPSEEK_MODEL: ENV.deepseekModel,
    OPENROUTER_API_URL: ENV.openrouterApiBaseUrl,
    OPENROUTER_API_KEY: ENV.openrouterApiKey,
    OPENROUTER_MODEL: ENV.openrouterModel,
    OPENROUTER_HTTP_REFERER: ENV.openrouterHttpReferer,
    OPENROUTER_X_TITLE: ENV.openrouterXTitle,
  });
}

function countMatches(text: string, expression: RegExp) {
  return Array.from(text.matchAll(expression)).length;
}

function tokenizeEstimate(text: string) {
  // A conservative, deterministic estimate only; provider usage remains billing truth.
  const graphemes = graphemeLength(text);
  const nonAscii = countMatches(text, /[^\x00-\x7f]/g);
  return Math.max(1, Math.ceil(graphemes / 4 + nonAscii / 4));
}

export function scoreComplexity(input: RoutingInput): ComplexityScore {
  const { document, mode, intensity } = input;
  const prose = document.units.map(unit => unit.text).join("\n");
  const source = document.source;
  const proseCharacterCount = document.units.reduce((total, unit) => total + graphemeLength(unit.text), 0);
  const sourceGraphemes = graphemeLength(source);
  const codeCharacterCount = Math.max(0, sourceGraphemes - proseCharacterCount);
  const entities = inferPassageSemanticContext(prose);
  const estimatedInputTokens = tokenizeEstimate(prose);
  const sentenceCount = Math.max(0, countMatches(prose, /[^.!?\n]+[.!?]?/g));
  const paragraphCount = prose.trim() ? prose.trim().split(/\n\s*\n/).length : 0;
  const lineCount = prose ? prose.split("\n").length : 0;
  const protectedRegionCount = document.segments.filter(segment => segment.kind !== "prose").length;
  const tableCount = document.segments.some(segment => segment.kind === "table-divider") ? 1 : 0;
  const fencedCodeBlockCount = document.segments.filter(segment => segment.kind === "fenced-code").length;
  const listItemCount = document.units.filter(unit => unit.nodeType === "list-item").length;
  const urlCount = countMatches(prose, /https?:\/\/[^\s)\]}>,]+/g);
  const identifierCount = countMatches(prose, /\b(?:[A-Z]{2,}(?:-[A-Z0-9]+)*|[A-Za-z][\w.-]*[A-Z][\w.-]*|[A-Za-z]+-\d+)\b/g);
  const unicodeComplexity = countMatches(prose, /[^\x00-\x7f]/g);
  const ambiguitySignals = Math.min(8, countMatches(prose, /\b(?:this|that|it|they|them|he|she|which|former|latter|respectively)\b/gi));
  const crossSentenceReferenceSignals = Math.min(8, countMatches(prose, /\b(?:this|that|these|those|it|they|them|he|she|former|latter|respectively)\b/gi));
  const markdownNodeCount = document.units.filter(unit => unit.nodeType !== "paragraph").length + document.immutableLabels.length;
  const protectedTermCount = Math.min(10, input.protectedTerms?.length ?? 0);

  let score = 0;
  if (estimatedInputTokens > ROUTING_THRESHOLDS.smallInputTokens) score += Math.min(20, Math.ceil(estimatedInputTokens / 800));
  score += Math.min(15, Math.floor(sentenceCount / 4) + Math.floor(paragraphCount / 2));
  score += Math.min(15, ambiguitySignals * 2);
  score += Math.min(10, markdownNodeCount + tableCount * 2 + fencedCodeBlockCount * 2);
  score += Math.min(10, protectedTermCount + Math.ceil((identifierCount + urlCount) / 2));
  score += mode === "rewrite" ? 7 : mode === "improve" || mode === "natural" ? 3 : 0;
  score += intensity === "high" ? 5 : intensity === "standard" ? 2 : 0;
  score += Math.min(5, Math.ceil(unicodeComplexity / 80));
  score = Math.min(100, score);

  const bucket: ComplexityBucket = estimatedInputTokens >= ROUTING_THRESHOLDS.difficultInputTokens || score >= 75
    ? "difficult"
    : estimatedInputTokens >= ROUTING_THRESHOLDS.largeInputTokens || score >= 50
      ? "large"
      : estimatedInputTokens > ROUTING_THRESHOLDS.smallInputTokens || score >= 25
        ? "ordinary"
        : "small";
  const reasons = [
    ...(estimatedInputTokens > ROUTING_THRESHOLDS.smallInputTokens ? ["large_prose"] : []),
    ...(crossSentenceReferenceSignals > 0 ? ["cross_sentence_references"] : []),
    ...(markdownNodeCount > 0 ? ["structured_document"] : []),
    ...(protectedTermCount + identifierCount + urlCount > 0 ? ["protected_tokens"] : []),
    ...(unicodeComplexity > 0 ? ["unicode_complexity"] : []),
    ...(mode === "rewrite" || intensity === "high" ? ["high_transformation_intensity"] : []),
  ].slice(0, 8);

  return {
    score,
    bucket,
    reasons,
    features: {
      graphemeCount: sourceGraphemes,
      estimatedInputTokens,
      sentenceCount,
      paragraphCount,
      lineCount,
      proseCharacterCount,
      codeCharacterCount,
      protectedRegionCount,
      markdownNodeCount,
      tableCount,
      fencedCodeBlockCount,
      listItemCount,
      urlCount,
      identifierCount,
      unicodeComplexity,
      ambiguitySignals,
      crossSentenceReferenceSignals,
      semanticEntityCount: entities.entities.length,
      relationCount: entities.relations.length,
      mode,
      intensity,
    },
  };
}

export function outputTokenBudget(inputTokens: number, mode: TransformationMode, intensity: TransformationIntensity, globalCap: number) {
  const multiplier = mode === "proofread" ? 0.85 : mode === "improve" ? 1 : mode === "natural" ? 1.05 : intensity === "high" ? 1.35 : 1.15;
  return Math.max(256, Math.min(globalCap, 2_400, Math.ceil(inputTokens * multiplier)));
}

export function chooseRoute(settings: ProviderSettings, complexity: ComplexityScore, modelCaps: { inputTokens: number; outputTokens: number }): RoutingDecision {
  if (modelCaps.inputTokens > settings.routing.maxEstimatedInputTokens) throw new Error("MODEL_CONTEXT_EXCEEDED");
  const tierOrder: Array<{ tier: RoutingTier; provider: LlmProviderName; model?: string }> = settings.routing.enabled
    ? [
        { tier: "default", provider: settings.routing.defaultProvider, model: settings.routing.defaultModel },
        { tier: "secondary", provider: settings.routing.secondaryProvider, model: settings.routing.secondaryModel },
        { tier: "tertiary", provider: settings.routing.tertiaryProvider, model: settings.routing.tertiaryModel },
        { tier: "quaternary", provider: settings.routing.quaternaryProvider, model: settings.routing.quaternaryModel },
      ]
    : [{ tier: "default", provider: settings.routing.defaultProvider, model: settings.routing.defaultModel }];
  const preferredTier: RoutingTier = complexity.bucket === "difficult"
    ? "quaternary"
    : complexity.bucket === "large" || complexity.features.crossSentenceReferenceSignals >= 3 || complexity.score >= 50
      ? "tertiary"
      : complexity.bucket === "ordinary"
        ? "secondary"
        : "default";
  const preferredIndex = Math.max(0, tierOrder.findIndex(item => item.tier === preferredTier));
  const available = tierOrder
    .map(item => ({ ...item, config: settings.providers.find(provider => provider.name === item.provider && provider.enabled) }))
    .filter((item): item is typeof item & { config: ProviderConfig } => Boolean(item.config));
  const selected = available.find(item => item.tier === preferredTier)
    ?? available.find(item => tierOrder.findIndex(route => route.tier === item.tier) >= preferredIndex)
    ?? available[available.length - 1];
  if (!selected) throw new Error("PROVIDER_NOT_CONFIGURED");
  const selectedIndex = tierOrder.findIndex(item => item.tier === selected.tier);
  const fallbackRoutes = settings.routing.allowProviderFallback
    ? available.filter(item => preferredTier === "quaternary"
      ? tierOrder.findIndex(route => route.tier === item.tier) < selectedIndex
      : tierOrder.findIndex(route => route.tier === item.tier) > selectedIndex)
    : [];
  if (preferredTier === "quaternary") fallbackRoutes.reverse();
  const output = Math.min(modelCaps.outputTokens, settings.routing.maxEstimatedOutputTokens);
  const reasons = [complexity.bucket, ...complexity.reasons].slice(0, 8);
  return {
    provider: selected.provider,
    model: selected.model || selected.config.defaultModel,
    tier: selected.tier,
    reasonCodes: reasons,
    estimatedPromptTokens: modelCaps.inputTokens,
    estimatedOutputTokens: output,
    fallbackProviders: fallbackRoutes.map(item => ({
      provider: item.provider,
      model: item.model || item.config.defaultModel,
      tier: item.tier,
    })),
  };
}

export function availableProviders(settings: ProviderSettings) {
  return settings.providers.filter(provider => provider.enabled).map(({ name, defaultModel }) => ({ provider: name, model: defaultModel }));
}
