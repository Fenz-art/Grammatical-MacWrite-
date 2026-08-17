import type {
  TransformInput,
  TransformationStreamEvent,
} from "../shared/transformations";
import { runSemanticGuard } from "./semanticGuard";
import { splitIntoDisplayChunks, transformText } from "./textTransform";
import { inferPassageSemanticContext } from "../shared/semanticContext";
import { recordTransformMetric } from "./transformMetrics";
import { releaseTransformLease, type TransformLease } from "./transformAdmission";
import { TransformProviderSafetyError } from "./providerSafety";

type Candidate = { text: string; model: string };
type CandidateGenerator = (input: TransformInput) => Promise<Candidate>;
type TransformStreamOptions = { lease?: TransformLease };

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
      recordTransformMetric({ at: Date.now(), elapsedMs: Date.now() - startedAt, queueWaitMs: options.lease?.queueWaitMs ?? 0, mode: input.mode, intensity: input.intensity ?? "standard", outcome: "rejected", providerFailure: false });
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
      },
    };
    recordTransformMetric({ at: Date.now(), elapsedMs: Date.now() - startedAt, queueWaitMs: options.lease?.queueWaitMs ?? 0, mode: input.mode, intensity: input.intensity ?? "standard", outcome: "accepted", providerFailure: false });
  } catch (error) {
    const failure = errorInfo(error);
    recordTransformMetric({ at: Date.now(), elapsedMs: Date.now() - startedAt, queueWaitMs: options.lease?.queueWaitMs ?? 0, mode: input.mode, intensity: input.intensity ?? "standard", outcome: "error", providerFailure: true, failureCode: failure.code });
    yield { type: "error", requestId: input.requestId, code: failure.code, retryable: failure.retryable, retryAfterMs: failure.retryAfterMs };
  } finally {
    if (options.lease) await releaseTransformLease(options.lease.requestId);
  }
}
