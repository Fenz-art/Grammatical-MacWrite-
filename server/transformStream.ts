import type {
  TransformInput,
  TransformationStreamEvent,
  LlmProvenance,
  LlmUsage,
  TransformComplexity,
} from "../shared/transformations";
import { runSemanticGuard } from "./semanticGuard";
import { splitIntoDisplayChunks, transformText } from "./textTransform";
import { inferPassageSemanticContext } from "../shared/semanticContext";
import { recordTransformMetric } from "./transformMetrics";
import { releaseTransformLease, type TransformLease } from "./transformAdmission";
import { TransformProviderSafetyError } from "./providerSafety";

type Candidate = { text: string; model: string; provenance?: LlmProvenance[]; usage?: LlmUsage; complexity?: TransformComplexity };
type CandidateGenerator = (input: TransformInput) => Promise<Candidate>;
type TransformStreamOptions = { lease?: TransformLease };

function metricMetadata(candidate: Pick<Candidate, "provenance" | "usage" | "complexity">) {
  const provenance = candidate.provenance?.[0];
  return {
    provider: provenance?.provider,
    requestedModel: provenance?.requestedModel,
    resolvedModel: provenance?.resolvedModel,
    routingTier: provenance?.routingTier,
    complexityBucket: candidate.complexity?.bucket,
    estimatedInputTokens: candidate.complexity?.estimatedInputTokens,
    actualInputTokens: candidate.usage?.promptTokens,
    actualOutputTokens: candidate.usage?.completionTokens,
    reasoningTokens: candidate.usage?.reasoningTokens,
    cachedTokens: candidate.usage?.cachedTokens,
    costUsd: candidate.usage?.costUsd,
    fallbackUsed: candidate.provenance?.some(item => item.fallbackUsed) ?? false,
  };
}

const delay = (ms: number, signal?: AbortSignal) =>
  new Promise<void>(resolve => {
    if (signal?.aborted) return resolve();
    const timeout = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(timeout);
      resolve();
    }, { once: true });
  });

function errorInfo(error: unknown): { code: import("../shared/transformations").TransformationErrorCode; retryable: boolean; retryAfterMs?: number } {
  if (error instanceof TransformProviderSafetyError) {
    return { code: error.code, retryable: error.retryable, retryAfterMs: error.retryAfterMs };
  }
  if (error instanceof Error && error.message.startsWith("PROVIDER_NOT_CONFIGURED")) {
    return { code: "PROVIDER_NOT_CONFIGURED", retryable: false };
  }
  return error instanceof Error && /429|rate/i.test(error.message)
    ? { code: "RATE_LIMITED", retryable: true }
    : { code: "SERVICE_UNAVAILABLE", retryable: true };
}

export async function* transformEventStream(
  input: TransformInput,
  signal?: AbortSignal,
  generate: CandidateGenerator = transformText,
  options: TransformStreamOptions = {}
): AsyncGenerator<TransformationStreamEvent> {
  const startedAt = Date.now();
  let candidateMetadata: Pick<Candidate, "provenance" | "usage" | "complexity"> = {};
  try {
    yield { type: "accepted", requestId: input.requestId, mode: input.mode };
    yield { type: "progress", requestId: input.requestId, phase: "analyzing" };
    await delay(1, signal);

    if (signal?.aborted) {
      yield { type: "error", requestId: input.requestId, code: "CANCELLED", retryable: false };
      return;
    }

    yield { type: "progress", requestId: input.requestId, phase: "transforming" };
    const candidate = await generate(input);
    candidateMetadata = candidate;
    if (!candidate.text || candidate.text.trim().length === 0) {
      throw new Error("The transformation provider returned an empty candidate.");
    }
    if (signal?.aborted) {
      recordTransformMetric({ at: Date.now(), elapsedMs: Date.now() - startedAt, queueWaitMs: options.lease?.queueWaitMs ?? 0, mode: input.mode, intensity: input.intensity ?? "standard", outcome: "cancelled", providerFailure: false });
      yield { type: "error", requestId: input.requestId, code: "CANCELLED", retryable: false };
      return;
    }

    yield { type: "progress", requestId: input.requestId, phase: "validating" };
    const validation = runSemanticGuard(input.text, candidate.text, input.protectedTerms, input.documentContext, input.codeCommentOnly);
    if (!validation.accepted) {
      recordTransformMetric({ at: Date.now(), elapsedMs: Date.now() - startedAt, queueWaitMs: options.lease?.queueWaitMs ?? 0, mode: input.mode, intensity: input.intensity ?? "standard", outcome: "rejected", providerFailure: false, ...metricMetadata(candidateMetadata) });
      yield {
        type: "rejected",
        requestId: input.requestId,
        reason: validation.reason || "Candidate text did not pass preservation checks.",
        fallbackText: input.text,
        checks: validation.checks,
        semanticRisks: validation.risks,
      };
      return;
    }

    let sequence = 0;
    for (const text of splitIntoDisplayChunks(candidate.text)) {
      if (signal?.aborted) {
        yield { type: "error", requestId: input.requestId, code: "CANCELLED", retryable: false };
        return;
      }
      yield { type: "delta", requestId: input.requestId, text, sequence };
      sequence += 1;
    }

    yield {
      type: "complete",
      requestId: input.requestId,
      result: {
        text: candidate.text,
        model: candidate.model,
        intensity: input.intensity ?? "standard",
        semanticContext: inferPassageSemanticContext(candidate.text),
        semanticRisks: validation.risks,
        validationStatus: "accepted",
        checks: validation.checks,
        elapsedMs: Date.now() - startedAt,
        provenance: candidate.provenance,
        usage: candidate.usage,
        complexity: candidate.complexity,
      },
    };
    recordTransformMetric({ at: Date.now(), elapsedMs: Date.now() - startedAt, queueWaitMs: options.lease?.queueWaitMs ?? 0, mode: input.mode, intensity: input.intensity ?? "standard", outcome: "accepted", providerFailure: false, ...metricMetadata(candidateMetadata) });
  } catch (error) {
    const failure = errorInfo(error);
    recordTransformMetric({ at: Date.now(), elapsedMs: Date.now() - startedAt, queueWaitMs: options.lease?.queueWaitMs ?? 0, mode: input.mode, intensity: input.intensity ?? "standard", outcome: "error", providerFailure: true, failureCode: failure.code, ...metricMetadata(candidateMetadata) });
    yield { type: "error", requestId: input.requestId, code: failure.code, retryable: failure.retryable, retryAfterMs: failure.retryAfterMs };
  } finally {
    if (options.lease) await releaseTransformLease(options.lease.requestId);
  }
}
