export const TRANSFORMATION_MODES = [
  "proofread",
  "improve",
  "natural",
  "rewrite",
] as const;

export type TransformationMode = (typeof TRANSFORMATION_MODES)[number];

export const TRANSFORMATION_INTENSITIES = ["low", "standard", "high"] as const;

export type TransformationIntensity = (typeof TRANSFORMATION_INTENSITIES)[number];

export const TRANSFORMATION_MODE_LABELS: Record<
  TransformationMode,
  string
> = {
  proofread: "PROOFREAD",
  improve: "IMPROVE",
  natural: "NATURAL",
  rewrite: "REWRITE",
};

export type ValidationStatus = "accepted" | "uncertain" | "rejected";

export type LlmProviderName = "groq" | "deepseek" | "openrouter" | "ollama" | "custom";
export type RoutingTier = "default" | "secondary" | "tertiary" | "quaternary";
export type ComplexityBucket = "small" | "ordinary" | "large" | "difficult";

export type LlmUsage = {
  promptTokens?: number;
  completionTokens?: number;
  reasoningTokens?: number;
  cachedTokens?: number;
  cacheWriteTokens?: number;
  totalTokens?: number;
  costUsd?: number;
};

export type LlmProvenance = {
  provider: LlmProviderName;
  requestedModel: string;
  resolvedModel?: string;
  routingTier: RoutingTier;
  providerRoute?: string;
  generationId?: string;
  fallbackUsed?: boolean;
};

export type TransformComplexity = {
  score: number;
  bucket: ComplexityBucket;
  reasonCodes: string[];
  estimatedInputTokens: number;
};

export type SemanticCheck = {
  dimension:
    | "numbers"
    | "dates"
    | "urls"
    | "code"
    | "terminology"
    | "negation"
    | "modality"
    | "quantifiers"
    | "emoji-specialchar"
    | "whitespace"
    | "entity-context"
    | "structure";
  protectedValues: string[];
  preserved: boolean;
};

export type TransformResult = {
  text: string;
  model: string;
  intensity: TransformationIntensity;
  semanticContext: import("./semanticContext").PassageSemanticContext;
  semanticRisks: import("./documentReview").SemanticRisk[];
  validationStatus: ValidationStatus;
  checks: SemanticCheck[];
  elapsedMs: number;
  provenance?: LlmProvenance[];
  usage?: LlmUsage;
  complexity?: TransformComplexity;
};

export type TransformationErrorCode =
  | "INPUT_TOO_LONG"
  | "AUTH_REQUIRED"
  | "RATE_LIMITED"
  | "CAPACITY_EXHAUSTED"
  | "BUDGET_EXHAUSTED"
  | "PROVIDER_CIRCUIT_OPEN"
  | "PROVIDER_NOT_CONFIGURED"
  | "DEADLINE_EXCEEDED"
  | "NETWORK_LOST"
  | "CANCELLED"
  | "SERVICE_UNAVAILABLE";

export type TransformInput = {
  requestId: string;
  text: string;
  mode: TransformationMode;
  intensity?: TransformationIntensity;
  protectedTerms?: string[];
  codeCommentOnly?: boolean;
  documentContext?: import("./documentReview").DocumentContext;
  clientRevision: number;
};

export type TransformationStreamEvent =
  | { type: "accepted"; requestId: string; mode: TransformationMode }
  | {
      type: "progress";
      requestId: string;
      phase: "analyzing" | "transforming" | "validating";
    }
  | { type: "delta"; requestId: string; text: string; sequence: number }
  | { type: "complete"; requestId: string; result: TransformResult }
  | {
      type: "rejected";
      requestId: string;
      reason: string;
      fallbackText: string;
      checks: SemanticCheck[];
      semanticRisks: import("./documentReview").SemanticRisk[];
    }
  | {
      type: "error";
      requestId: string;
      code: TransformationErrorCode;
      retryable: boolean;
      retryAfterMs?: number;
    };

export function isTransformationMode(value: string): value is TransformationMode {
  return TRANSFORMATION_MODES.includes(value.toLowerCase() as TransformationMode);
}
