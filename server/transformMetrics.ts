import { desc, gte } from "drizzle-orm";
import { transformMetricEvents } from "../drizzle/schema";
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
    await db.insert(transformMetricEvents).values({
      at: new Date(sample.at),
      elapsedMs: Math.max(0, Math.round(sample.elapsedMs)),
      queueWaitMs: Math.max(0, Math.round(sample.queueWaitMs ?? 0)),
      mode: sample.mode,
      intensity: sample.intensity,
      outcome: sample.outcome,
      providerFailure: sample.providerFailure,
      failureCode: sample.failureCode ?? null,
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
    const rows = await db.select().from(transformMetricEvents).where(gte(transformMetricEvents.at, since)).orderBy(desc(transformMetricEvents.at)).limit(500);
    const durableSamples: TransformMetricSample[] = rows.reverse().map(row => ({
      at: row.at.getTime(),
      elapsedMs: row.elapsedMs,
      queueWaitMs: row.queueWaitMs,
      mode: row.mode,
      intensity: row.intensity,
      outcome: row.outcome,
      providerFailure: row.providerFailure,
      failureCode: row.failureCode ?? undefined,
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
