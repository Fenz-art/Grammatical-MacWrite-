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
    return await db.$transaction(async tx => {
      const incrementUsageWindow = async (
        windowType: "minute" | "day",
        windowStart: Date,
        limit: number,
      ) => {
        const existing = await tx.transformUsageWindow.findFirst({
          where: { userOpenId, windowType, windowStart },
        });
        const current = existing?.requestCount ?? 0;
        if (current >= limit) return false;
        if (existing) {
          await tx.transformUsageWindow.update({
            where: { id: existing.id },
            data: { requestCount: current + 1, updatedAt: new Date() },
          });
        } else {
          await tx.transformUsageWindow.create({
            data: { userOpenId, windowType, windowStart, requestCount: 1 },
          });
        }
        return true;
      };

      const now = new Date();
      await tx.transformControlLock.upsert({
        where: { id: "global" },
        create: { id: "global", updatedAt: now },
        update: { updatedAt: now },
      });
      await tx.transformConcurrencyLease.deleteMany({ where: { expiresAt: { lt: now } } });

      const active = await tx.transformConcurrencyLease.count({ where: { expiresAt: { gt: now } } });
      if (active >= TRANSFORM_ADMISSION_POLICY.globalConcurrentTransforms) {
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

      await tx.transformConcurrencyLease.create({
        data: {
          requestId,
          userOpenId,
          expiresAt: new Date(now.getTime() + TRANSFORM_ADMISSION_POLICY.leaseDurationMs),
        },
      });
      return { allowed: true, lease: { requestId, userOpenId, queueWaitMs: Date.now() - startedAt } } as const;
    }, { maxWait: 10_000, timeout: 15_000 });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error) {
      const prismaError = error as { code?: unknown; meta?: { modelName?: unknown; code?: unknown }; name?: unknown };
      console.error("[Transform admission] Control-plane transaction failed", {
        name: typeof prismaError.name === "string" ? prismaError.name : "unknown",
        code: typeof prismaError.code === "string" ? prismaError.code : undefined,
        databaseCode: typeof prismaError.meta?.code === "string" ? prismaError.meta.code : undefined,
        model: typeof prismaError.meta?.modelName === "string" ? prismaError.meta.modelName : undefined,
      });
    } else {
      console.error("[Transform admission] Control-plane transaction failed", error instanceof Error ? error.name : "unknown");
    }
    return { allowed: false, code: "SERVICE_UNAVAILABLE", retryAfterMs: 5_000 };
  }
}

export async function releaseTransformLease(requestId: string) {
  const db = await getDb();
  if (!db) return;
  try {
    await db.transformConcurrencyLease.deleteMany({ where: { requestId } });
  } catch (error) {
    console.error("[Transform admission] Lease release failed", error instanceof Error ? error.name : "unknown");
  }
}
