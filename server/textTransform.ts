import { invokeLLM, LLMProviderError, type Message } from "./_core/llm";
import { chooseRoute, outputTokenBudget, resolveConfiguredLLMSettings, scoreComplexity, type ComplexityScore, type ProviderConfig } from "./_core/llmProviders";
import {
  TRANSFORMATION_MODE_LABELS,
  type TransformationIntensity,
  type TransformationMode,
  type LlmProvenance,
  type LlmUsage,
  type TransformComplexity,
} from "../shared/transformations";
import { safePrefixByGrapheme } from "../shared/unicodeText";
import { formatPassageSemanticContext, inferPassageSemanticContext } from "../shared/semanticContext";
import { WRITING_PROFILES, type DocumentContext } from "../shared/documentReview";
import { normalizeEditableCandidate, parseStructuredDocument, reconstructStructuredDocument } from "../shared/structuredDocument";
import {
  PROVIDER_SAFETY_POLICY,
  TransformProviderSafetyError,
  providerRetryDelay,
  recordProviderOutcome,
  reserveProviderAttempt,
} from "./providerSafety";

const MODE_INSTRUCTIONS: Record<TransformationMode, string> = {
  proofread:
    "Correct grammar, spelling, punctuation, capitalization, agreement, and obvious mechanical errors. Read the entire passage first and use relations across sentences to resolve incomplete phrases. Preserve wording and sentence structure whenever possible, but repair a malformed noun phrase when the surrounding context clearly determines its grammatical form. Make only minimal edits.",
  improve:
    "Read the entire passage before editing. Improve clarity, flow, concision, agreement, and professional polish while preserving facts, names, numbers, and intended certainty. Resolve references and role descriptions across neighboring sentences. You may complete an incomplete grammatical phrase when the context makes the intended form unambiguous, but do not invent a new person, job, fact, or claim.",
  natural:
    "Analyze the whole passage, including how each sentence relates to the next. Make the writing natural, fluent, and conversational while preserving facts, names, numbers, and intended certainty. Resolve pronouns, entity roles, and incomplete noun phrases from context; for example, a person introducing themself as an occupation should receive the grammatically complete occupation form. Do not add facts.",
  rewrite:
    "Read and model the complete passage before rewriting. Reorganize and rephrase for stronger structure and readability while preserving facts, names, numbers, dates, negation, modality, entity identity, and intent. Keep each person, object, role, and relationship consistent across sentences. Correct context-determined grammatical forms and incomplete occupational or descriptive noun phrases when the intended meaning is clear; do not invent information or freeze a malformed phrase merely because it appears in the source.",
};

function readTextContent(content: Message["content"] | null | undefined): string {
  if (typeof content === "string") return content.trim();
  if (Array.isArray(content)) {
    return content.reduce<string>((joined, part) => {
      if (typeof part === "string" || part.type !== "text") return joined;
      return joined + part.text;
    }, "").trim();
  }
  return "";
}

const INTENSITY_INSTRUCTIONS: Record<TransformationIntensity, string> = {
  low: "Intensity: LOW. Correct only clearly erroneous grammar, spelling, agreement, punctuation, and unambiguous incomplete phrases. Preserve wording, structure, and tone whenever possible.",
  standard: "Intensity: STANDARD. Apply the mode’s normal degree of improvement, resolving clear cross-sentence context while preserving facts, identity, terminology, and intent.",
  high: "Intensity: HIGH. Apply the mode confidently for stronger clarity, naturalness, or structure, but never invent facts, alter entity identity, or override protected semantic evidence.",
};

export function buildTransformMessages(text: string, mode: TransformationMode, intensity: TransformationIntensity = "standard", options: { protectedTerms?: string[]; documentContext?: DocumentContext; codeCommentOnly?: boolean } = {}): Message[] {
  const protectedTerms = Array.from(new Set((options.protectedTerms ?? []).map(term => term.trim()).filter(Boolean))).slice(0, 50);
  const documentContext = options.documentContext;
  const profile = documentContext?.profileId ? WRITING_PROFILES[documentContext.profileId] : WRITING_PROFILES.professional;
  const neighboringContext = documentContext ? [
    `Document context: block ${documentContext.blockIndex + 1} of ${documentContext.blockCount}; ${documentContext.totalCharacters} source characters in the document.`,
    documentContext.title ? `Document title: ${documentContext.title}.` : "",
    documentContext.beforeExcerpt ? `Preceding excerpt for consistency only: ${documentContext.beforeExcerpt}` : "",
    documentContext.afterExcerpt ? `Following excerpt for consistency only: ${documentContext.afterExcerpt}` : "",
    "Use neighboring excerpts only to maintain references, capitalization, terminology, and tone. Do not copy them into the transformed block or infer facts absent from the target block.",
  ].filter(Boolean).join("\n") : "This is a single-block document.";
  return [
    {
      role: "system",
      content: [
        "You are Grammatical, a semantic-preserving writing transformation engine.",
        `Active mode: ${TRANSFORMATION_MODE_LABELS[mode]}.`,
        MODE_INSTRUCTIONS[mode],
        INTENSITY_INSTRUCTIONS[intensity],
        `Writing profile: ${profile.label}. ${profile.instruction}`,
        protectedTerms.length ? `User-protected terms: ${protectedTerms.join(" · ")}. Preserve them exactly, including capitalization, unless the source itself contains a clear typo inside a term.` : "No user-protected glossary terms were supplied.",
        neighboringContext,
        "The model proposes a candidate; an external validation layer decides whether it is shown.",
        options.codeCommentOnly
          ? "Structured-source policy: Code-comment mode is active. The supplied text is the natural-language body of a code comment. Transform only that wording and return only the comment body. Never emit or change code, comment markers, fenced-code delimiters or language labels, commands, identifiers, URLs, Markdown/GitHub PR framing, metadata, HTML/card framing, or comments outside the supplied body."
          : "Structured-source policy: Preserve Markdown and GitHub PR framing exactly. Never add, remove, or rewrite heading markers, list markers, task checkboxes, block-quote markers, table pipes or divider rows, link destinations, inline-code delimiters, fenced-code delimiters or language labels, commands, identifiers, URLs, PR metadata, HTML/card framing, or comments. When the supplied text is an extracted editable region, transform only its human-readable wording and return only that region—never surrounding Markdown or code syntax.",
        "Reason at passage level before producing output: identify entities and their types (person, organization, object), then track each entity’s role, attributes, pronouns, and relationships across every sentence. Separate protected proper names and factual tokens from ordinary words whose grammatical form may need correction. Do not invent a person, occupation, object, event, or relationship.",
        `Typed passage context: ${formatPassageSemanticContext(inferPassageSemanticContext(text))}`,
        "A contextual grammatical repair is allowed when it preserves the same referent and meaning. Example: 'I am Pratyush. I am a software engine.' should become 'I am Pratyush. I am a software engineer.' because the second sentence describes a human’s occupation; do not change the name or invent a different occupation.",
        "Return transformed text only. Do not add headings, explanations, quotation marks, markdown fences, HTML, or a preface.",
        "If no edit is warranted, return the input unchanged.",
        "Preserve meaningful emoji, emoji punctuation, Unicode characters, special symbols, ASCII sequences, tabs, line breaks, and boundary whitespace exactly unless changing them is explicitly required by the source meaning.",
      ].join("\n"),
    },
    { role: "user", content: text },
  ];
}

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

function isRetryableProviderError(error: unknown) {
  if (error instanceof LLMProviderError) return [408, 409, 425, 429, 500, 502, 503, 504].includes(error.status);
  return error instanceof Error && /timeout|temporar|network|fetch/i.test(error.message);
}

function normalizeUsage(response: Awaited<ReturnType<typeof invokeLLM>>): LlmUsage {
  const usage = response.usage;
  if (!usage) return {};
  const promptTokens = usage.prompt_tokens;
  const completionTokens = usage.completion_tokens;
  const reasoningTokens = usage.reasoning_tokens ?? usage.completion_tokens_details?.reasoning_tokens;
  const cachedTokens = usage.prompt_tokens_details?.cached_tokens;
  const cacheWriteTokens = usage.prompt_tokens_details?.cache_write_tokens;
  return {
    ...(promptTokens !== undefined ? { promptTokens } : {}),
    ...(completionTokens !== undefined ? { completionTokens } : {}),
    ...(reasoningTokens !== undefined ? { reasoningTokens } : {}),
    ...(cachedTokens !== undefined ? { cachedTokens } : {}),
    ...(cacheWriteTokens !== undefined ? { cacheWriteTokens } : {}),
    ...(usage.total_tokens !== undefined ? { totalTokens: usage.total_tokens } : {}),
    ...(typeof usage.cost === "number" ? { costUsd: usage.cost } : {}),
  };
}

function addUsage(left: LlmUsage, right: LlmUsage): LlmUsage {
  const keys: Array<keyof LlmUsage> = ["promptTokens", "completionTokens", "reasoningTokens", "cachedTokens", "cacheWriteTokens", "totalTokens", "costUsd"];
  const sum = {} as LlmUsage;
  for (const key of keys) {
    const a = left[key];
    const b = right[key];
    if (typeof a === "number" || typeof b === "number") sum[key] = Math.max(0, Number(a ?? 0) + Number(b ?? 0));
  }
  return sum;
}

type PlainTransformResult = { text: string; model: string; provenance: LlmProvenance[]; usage: LlmUsage };

function transformTierProvider(settings: ReturnType<typeof resolveConfiguredLLMSettings>, tier: string, name: string): ProviderConfig | undefined {
  const allowedName = name as ProviderConfig["name"];
  return settings.providers.find(provider => provider.name === allowedName && provider.enabled);
}

async function transformPlainText({
  text,
  mode,
  intensity = "standard",
  protectedTerms,
  documentContext,
  codeCommentOnly,
  complexity: suppliedComplexity,
}: {
  text: string;
  mode: TransformationMode;
  intensity?: TransformationIntensity;
  protectedTerms?: string[];
  documentContext?: DocumentContext;
  codeCommentOnly?: boolean;
  complexity?: ComplexityScore;
}): Promise<PlainTransformResult> {
  const settings = resolveConfiguredLLMSettings();
  const complexity = suppliedComplexity ?? scoreComplexity({
    document: parseStructuredDocument(text),
    mode,
    intensity,
    protectedTerms,
  });
  const estimatedOutputTokens = outputTokenBudget(complexity.features.estimatedInputTokens, mode, intensity, settings.routing.maxEstimatedOutputTokens);
  const decision = chooseRoute(settings, complexity, {
    inputTokens: complexity.features.estimatedInputTokens,
    outputTokens: estimatedOutputTokens,
  });
  const candidates: Array<{ provider: ProviderConfig; model: string; tier: string }> = [];
  const primary = transformTierProvider(settings, decision.tier, decision.provider);
  if (primary) candidates.push({ provider: primary, model: decision.model, tier: decision.tier });
  for (const fallback of decision.fallbackProviders) {
    const provider = transformTierProvider(settings, fallback.tier, fallback.provider);
    if (provider && !candidates.some(candidate => candidate.provider.name === provider.name && candidate.model === fallback.model)) {
      candidates.push({ provider, model: fallback.model, tier: fallback.tier });
    }
  }
  let lastError: unknown;
  for (let providerIndex = 0; providerIndex < candidates.length; providerIndex += 1) {
    const selected = candidates[providerIndex];
    if (!selected) continue;
    const { provider, model, tier } = selected;
    for (let attempt = 0; attempt <= provider.maxRetries && attempt < PROVIDER_SAFETY_POLICY.maxAttempts; attempt += 1) {
      const admission = await reserveProviderAttempt(provider.name, estimatedOutputTokens);
      if (!admission.allowed) throw admission.error;
      const controller = new AbortController();
      const deadline = setTimeout(() => controller.abort(new TransformProviderSafetyError("DEADLINE_EXCEEDED", true)), Math.min(provider.timeoutMs, PROVIDER_SAFETY_POLICY.deadlineMs));
      try {
        const response = await invokeLLM({
          model,
          messages: buildTransformMessages(text, mode, intensity, { protectedTerms, documentContext, codeCommentOnly }),
          maxCompletionTokens: estimatedOutputTokens,
          signal: controller.signal,
        }, provider);
        const transformed = readTextContent(response.choices[0]?.message.content);
        if (!transformed) throw new Error("The transformation provider returned an empty result.");
        await recordProviderOutcome(true, provider.name);
        const resolvedModel = response.model || provider.defaultModel;
        return {
          text: transformed,
          model: resolvedModel,
          provenance: [{
            provider: provider.name,
            requestedModel: model,
            resolvedModel,
            routingTier: tier as LlmProvenance["routingTier"],
            providerRoute: response.providerRoute,
            generationId: response.id,
            fallbackUsed: providerIndex > 0,
          }],
          usage: normalizeUsage(response),
        };
      } catch (error) {
        lastError = error;
        const deadlineExceeded = controller.signal.aborted && controller.signal.reason instanceof TransformProviderSafetyError;
        if (!(error instanceof TransformProviderSafetyError)) await recordProviderOutcome(false, provider.name);
        if (deadlineExceeded) throw controller.signal.reason;
        if (error instanceof TransformProviderSafetyError) throw error;

        const retryable = isRetryableProviderError(error);
        if (retryable && attempt < provider.maxRetries && attempt < PROVIDER_SAFETY_POLICY.maxAttempts - 1) {
          await wait(providerRetryDelay(attempt));
          continue;
        }

        if (providerIndex < candidates.length - 1 && settings.routing.allowProviderFallback && (retryable || error instanceof LLMProviderError && [401, 402, 403].includes(error.status))) break;
        throw error;
      } finally {
        clearTimeout(deadline);
      }
    }
    if (providerIndex < candidates.length - 1) {
      console.warn(`[LLM] configured route ${provider.name} failed; switching to configured fallback ${candidates[providerIndex + 1]?.provider.name ?? "unknown"}`);
      continue;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("The transformation service failed after retries.");
}

export async function transformText({
  text,
  mode,
  intensity = "standard",
  protectedTerms,
  documentContext,
  codeCommentOnly,
}: {
  text: string;
  mode: TransformationMode;
  intensity?: TransformationIntensity;
  protectedTerms?: string[];
  documentContext?: DocumentContext;
  codeCommentOnly?: boolean;
}): Promise<PlainTransformResult & { complexity: TransformComplexity }> {
  const document = parseStructuredDocument(text, { transformCodeComments: codeCommentOnly });
  const complexity = scoreComplexity({ document, mode, intensity, protectedTerms });
  const complexitySummary: TransformComplexity = { score: complexity.score, bucket: complexity.bucket, reasonCodes: complexity.reasons, estimatedInputTokens: complexity.features.estimatedInputTokens };
  if (!document.hasStructure || !document.units.length) {
    const result = await transformPlainText({ text, mode, intensity, protectedTerms, documentContext, codeCommentOnly, complexity });
    return { ...result, complexity: complexitySummary };
  }
  const transformed: Record<string, string> = {};
  let model = "structure-preserving";
  let usage: LlmUsage = {};
  const provenance: LlmProvenance[] = [];
  for (const unit of document.units) {
    if (!unit.text.trim()) {
      transformed[unit.id] = unit.text;
      continue;
    }
    const result = await transformPlainText({ text: unit.text, mode, intensity, protectedTerms, documentContext, codeCommentOnly: codeCommentOnly && unit.nodeType === "code-comment", complexity });
    transformed[unit.id] = normalizeEditableCandidate(unit.text, result.text);
    model = result.model;
    usage = addUsage(usage, result.usage);
    provenance.push(...result.provenance);
  }
  const uniqueProvenance = provenance.filter((item, index, all) => all.findIndex(candidate => candidate.provider === item.provider && candidate.requestedModel === item.requestedModel && candidate.resolvedModel === item.resolvedModel && candidate.routingTier === item.routingTier) === index);
  return { text: reconstructStructuredDocument(document, transformed), model, provenance: uniqueProvenance, usage, complexity: complexitySummary };
}

export function splitIntoDisplayChunks(text: string, targetSize = 32): string[] {
  if (text.length <= targetSize) return [text];
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > targetSize) {
    const limit = Math.min(remaining.length, targetSize + 24);
    const candidate = safePrefixByGrapheme(remaining, limit);
    const splitAt = Math.max(candidate.lastIndexOf(" "), candidate.lastIndexOf("\n"));
    const preferredEnd = splitAt > Math.floor(targetSize * 0.55) ? splitAt + 1 : targetSize;
    const safeEnd = safePrefixByGrapheme(remaining, preferredEnd).length || candidate.length;
    chunks.push(remaining.slice(0, safeEnd));
    remaining = remaining.slice(safeEnd);
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}
