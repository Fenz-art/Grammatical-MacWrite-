import { and, count, eq, gt, lt, sql } from "drizzle-orm";
import {
  transformConcurrencyLeases,
  transformControlLocks,
  transformUsageWindows,
} from "../drizzle/schema";
import { getDb } from "./db";

export const TRANSFORM_ADMISSION_POLICY = {
  requestsPerMinute: 20,
  requestsPerDay: 200,
  globalConcurrentTransforms: 6,
  leaseDurationMs: 120_000,
} as const;

type AdmissionFailure = {
  allowed: false;
  code: "RATE_LIMITED" | "CAPACITY_EXHAUSTED" | "SERVICE_UNAVAILABLE";
  retryAfterMs: number;
};

export type TransformLease = {
  requestId: string;
  userOpenId: string;
  queueWaitMs: number;
};

export type TransformAdmission = { allowed: true; lease: TransformLease } | AdmissionFailure;

function startOfMinute(now: Date) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), now.getUTCHours(), now.getUTCMinutes()));
}

function startOfDay(now: Date) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/**
 * Acquire a fleet-wide lease and durable request quota. The control-plane lock makes the
 * short select/update sequence safe across autoscaled instances without storing user text.
 */
export async function admitTransformRequest(userOpenId: string, requestId: string): Promise<TransformAdmission> {
  const startedAt = Date.now();
  const db = await getDb();
  if (!db) return { allowed: false, code: "SERVICE_UNAVAILABLE", retryAfterMs: 5_000 };

  try {
    return await db.transaction(async tx => {
      const incrementUsageWindow = async (
        windowType: "minute" | "day",
        windowStart: Date,
        limit: number,
      ) => {
        const existing = await tx.select().from(transformUsageWindows).where(and(
          eq(transformUsageWindows.userOpenId, userOpenId),
          eq(transformUsageWindows.windowType, windowType),
          eq(transformUsageWindows.windowStart, windowStart),
        )).limit(1);
        const current = existing[0]?.requestCount ?? 0;
        if (current >= limit) return false;
        if (existing[0]) {
          await tx.update(transformUsageWindows).set({ requestCount: current + 1, updatedAt: new Date() }).where(eq(transformUsageWindows.id, existing[0].id));
        } else {
          await tx.insert(transformUsageWindows).values({ userOpenId, windowType, windowStart, requestCount: 1 });
        }
        return true;
      };

      await tx.execute(sql`SELECT id FROM transform_control_locks WHERE id = 'global' FOR UPDATE`);
      const now = new Date();
      await tx.delete(transformConcurrencyLeases).where(lt(transformConcurrencyLeases.expiresAt, now));

      const activeRows = await tx.select({ active: count() }).from(transformConcurrencyLeases).where(gt(transformConcurrencyLeases.expiresAt, now));
      if (Number(activeRows[0]?.active ?? 0) >= TRANSFORM_ADMISSION_POLICY.globalConcurrentTransforms) {
        return { allowed: false, code: "CAPACITY_EXHAUSTED", retryAfterMs: 5_000 } as const;
      }

      const minuteStart = startOfMinute(now);
      const withinMinute = await incrementUsageWindow("minute", minuteStart, TRANSFORM_ADMISSION_POLICY.requestsPerMinute);
      if (!withinMinute) {
        return { allowed: false, code: "RATE_LIMITED", retryAfterMs: Math.max(1_000, minuteStart.getTime() + 60_000 - now.getTime()) } as const;
      }

      const dayStart = startOfDay(now);
      const withinDay = await incrementUsageWindow("day", dayStart, TRANSFORM_ADMISSION_POLICY.requestsPerDay);
      if (!withinDay) {
        return { allowed: false, code: "RATE_LIMITED", retryAfterMs: Math.max(1_000, dayStart.getTime() + 86_400_000 - now.getTime()) } as const;
      }

      await tx.insert(transformConcurrencyLeases).values({
        requestId,
        userOpenId,
        expiresAt: new Date(now.getTime() + TRANSFORM_ADMISSION_POLICY.leaseDurationMs),
      });
      return { allowed: true, lease: { requestId, userOpenId, queueWaitMs: Date.now() - startedAt } } as const;
    });
  } catch (error) {
    console.error("[Transform admission] Control-plane transaction failed", error instanceof Error ? error.name : "unknown");
    return { allowed: false, code: "SERVICE_UNAVAILABLE", retryAfterMs: 5_000 };
  }
}

export async function releaseTransformLease(requestId: string) {
  const db = await getDb();
  if (!db) return;
  try {
    await db.delete(transformConcurrencyLeases).where(eq(transformConcurrencyLeases.requestId, requestId));
  } catch (error) {
    console.error("[Transform admission] Lease release failed", error instanceof Error ? error.name : "unknown");
  }
}
