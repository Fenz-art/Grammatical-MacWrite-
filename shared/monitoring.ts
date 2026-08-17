import type { TransformationIntensity, TransformationMode } from "./transformations";

export type TransformMetricOutcome = "accepted" | "rejected" | "error" | "cancelled";

export type TransformMetricSample = {
  at: number;
  elapsedMs: number;
  queueWaitMs?: number;
  mode: TransformationMode;
  intensity: TransformationIntensity;
  outcome: TransformMetricOutcome;
  providerFailure: boolean;
  failureCode?: string;
};

export type TransformMetricsSnapshot = {
  scope: "current-instance" | "fleet-24h";
  retentionWindowMinutes: number;
  updatedAt: number;
  total: number;
  accepted: number;
  rejected: number;
  providerFailures: number;
  averageLatencyMs: number;
  averageQueueWaitMs: number;
  successRate: number;
  queueThroughputPerMinute: number;
  modeBreakdown: { mode: TransformationMode; count: number; accepted: number }[];
  samples: TransformMetricSample[];
};
