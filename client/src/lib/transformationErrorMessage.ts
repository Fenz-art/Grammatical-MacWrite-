import type { TransformationErrorCode } from "@shared/transformations";

export function transformationErrorMessage(code: TransformationErrorCode): string {
  switch (code) {
    case "CANCELLED":
      return "Transformation cancelled. Your input is preserved above.";
    case "AUTH_REQUIRED":
      return "Your session expired. Sign in again before retrying; your input is preserved.";
    case "RATE_LIMITED":
      return "Your transformation quota is temporarily exhausted. Try again after the stated limit window.";
    case "CAPACITY_EXHAUSTED":
      return "Grammatical is protecting active work from a traffic burst. Try again shortly.";
    case "BUDGET_EXHAUSTED":
    case "PROVIDER_CIRCUIT_OPEN":
      return "The provider safety guard is temporarily active. Your input is preserved; try again later.";
    case "PROVIDER_NOT_CONFIGURED":
      return "LLM provider configuration is incomplete. Configure LLM_API_KEY and LLM_MODEL, plus a key and model for any enabled fallback; your input is preserved.";
    case "DEADLINE_EXCEEDED":
      return "The provider did not complete within the safety deadline. Your input is preserved.";
    case "NETWORK_LOST":
      return "Connection to Grammatical was interrupted. Your input is preserved; check your connection and retry.";
    case "SERVICE_UNAVAILABLE":
      return "The transformation service could not complete this request. Your input is preserved; retry when the service is available.";
    case "INPUT_TOO_LONG":
      return "This input is too long to transform in one request. Your input is preserved.";
  }
}