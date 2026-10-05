import type { TransformMetricSample, TransformMetricsSnapshot } from "../shared/monitoring";
import type { TransformationMode } from "../shared/transformations";
import { getDb } from "./db";

export type { TransformMetricSample } from "../shared/monitoring";

const SAMPLE_LIMIT = 80;
const samples: TransformMetricSample[] = [];

export function recordTransformMetric(sample: TransformMetricSample) {
  samples.push(sample);
  if (samples.length > SAMPLE_LIMIT) samples.splice(0, samples.length - SAMPLE_LIMIT);
  void persistTransformMetric(sample);
}

async function persistTransformMetric(sample: TransformMetricSample) {
  const db = await getDb();
  if (!db) return;
  try {
    await db.transformMetricEvent.create({
      data: {
        at: new Date(sample.at),
        elapsedMs: Math.max(0, Math.round(sample.elapsedMs)),
        queueWaitMs: Math.max(0, Math.round(sample.queueWaitMs ?? 0)),
        mode: sample.mode,
        intensity: sample.intensity,
        outcome: sample.outcome,
        providerFailure: sample.providerFailure,
        failureCode: sample.failureCode ?? null,
        provider: sample.provider ?? null,
        requestedModel: sample.requestedModel ?? null,
        resolvedModel: sample.resolvedModel ?? null,
        routingTier: sample.routingTier ?? null,
        complexityBucket: sample.complexityBucket ?? null,
        estimatedInputTokens: sample.estimatedInputTokens ?? null,
        actualInputTokens: sample.actualInputTokens ?? null,
        actualOutputTokens: sample.actualOutputTokens ?? null,
        reasoningTokens: sample.reasoningTokens ?? null,
        cachedTokens: sample.cachedTokens ?? null,
        costUsd: sample.costUsd ?? null,
        fallbackUsed: sample.fallbackUsed ?? false,
      },
    });
  } catch (error) {
    // Telemetry must never interrupt a user transformation; logs omit user text and prompts.
    console.error("[Transform metrics] Durable event insert failed", error instanceof Error ? error.name : "unknown");
  }
}

function buildSnapshot(samplesForWindow: TransformMetricSample[], scope: TransformMetricsSnapshot["scope"], retentionWindowMinutes: number): TransformMetricsSnapshot {
  const now = Date.now();
  const completed = samplesForWindow.filter(sample => sample.outcome !== "cancelled");
  const accepted = completed.filter(sample => sample.outcome === "accepted");
  const providerFailures = samplesForWindow.filter(sample => sample.providerFailure).length;
  const averageLatencyMs = completed.length ? Math.round(completed.reduce((sum, sample) => sum + sample.elapsedMs, 0) / completed.length) : 0;
  const averageQueueWaitMs = completed.length ? Math.round(completed.reduce((sum, sample) => sum + (sample.queueWaitMs ?? 0), 0) / completed.length) : 0;
  const throughputWindow = samplesForWindow.filter(sample => now - sample.at <= 60_000 && sample.outcome === "accepted").length;
  const modeBreakdown = (["proofread", "improve", "natural", "rewrite"] as TransformationMode[]).map(mode => ({
    mode,
    count: samplesForWindow.filter(sample => sample.mode === mode).length,
    accepted: samplesForWindow.filter(sample => sample.mode === mode && sample.outcome === "accepted").length,
  }));
  return {
    scope,
    retentionWindowMinutes,
    updatedAt: now,
    total: samplesForWindow.length,
    accepted: accepted.length,
    rejected: samplesForWindow.filter(sample => sample.outcome === "rejected").length,
    providerFailures,
    averageLatencyMs,
    averageQueueWaitMs,
    successRate: completed.length ? Math.round((accepted.length / completed.length) * 100) : 100,
    queueThroughputPerMinute: throughputWindow,
    modeBreakdown,
    samples: samplesForWindow.slice(-24),
  };
}

export function getTransformMetrics(): TransformMetricsSnapshot {
  return buildSnapshot(samples, "current-instance", 0);
}

/** 24-hour aggregate across instances; retained samples never contain input/output text or identity. */
export async function getFleetTransformMetrics(): Promise<TransformMetricsSnapshot> {
  const db = await getDb();
  if (!db) return getTransformMetrics();
  const since = new Date(Date.now() - 24 * 60 * 60 * 1_000);
  try {
    const rows = await db.transformMetricEvent.findMany({
      where: { at: { gte: since } },
      orderBy: { at: "desc" },
      take: 500,
    });
    const durableSamples: TransformMetricSample[] = rows.reverse().map(row => ({
      at: row.at.getTime(),
      elapsedMs: row.elapsedMs,
      queueWaitMs: row.queueWaitMs,
      mode: row.mode as TransformMetricSample["mode"],
      intensity: row.intensity as TransformMetricSample["intensity"],
      outcome: row.outcome as TransformMetricSample["outcome"],
      providerFailure: row.providerFailure,
      failureCode: row.failureCode ?? undefined,
      provider: (row.provider ?? undefined) as TransformMetricSample["provider"],
      requestedModel: row.requestedModel ?? undefined,
      resolvedModel: row.resolvedModel ?? undefined,
      routingTier: (row.routingTier ?? undefined) as TransformMetricSample["routingTier"],
      complexityBucket: (row.complexityBucket ?? undefined) as TransformMetricSample["complexityBucket"],
      estimatedInputTokens: row.estimatedInputTokens ?? undefined,
      actualInputTokens: row.actualInputTokens ?? undefined,
      actualOutputTokens: row.actualOutputTokens ?? undefined,
      reasoningTokens: row.reasoningTokens ?? undefined,
      cachedTokens: row.cachedTokens ?? undefined,
      costUsd: row.costUsd ?? undefined,
      fallbackUsed: row.fallbackUsed,
    }));
    return buildSnapshot(durableSamples, "fleet-24h", 24 * 60);
  } catch (error) {
    console.error("[Transform metrics] Fleet aggregate failed", error instanceof Error ? error.name : "unknown");
    return getTransformMetrics();
  }
}

export function resetTransformMetricsForTests() {
  samples.splice(0, samples.length);
}
