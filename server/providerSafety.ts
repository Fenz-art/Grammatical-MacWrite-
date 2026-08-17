import { eq, sql } from "drizzle-orm";
import { providerCircuitStates, providerSpendWindows, transformControlLocks } from "../drizzle/schema";
import type { TransformationErrorCode } from "../shared/transformations";
import { getDb } from "./db";

const PROVIDER_KEY = "builtin-llm-transform";
export const PROVIDER_SAFETY_POLICY = {
  maxAttempts: 3,
  deadlineMs: 45_000,
  retryBaseMs: 500,
  retryCapMs: 6_000,
  failureThreshold: 5,
  circuitCooldownMs: 60_000,
  estimatedCompletionTokens: 2_400,
  dailyReservedTokenBudget: 480_000,
} as const;

export class TransformProviderSafetyError extends Error {
  constructor(
    public readonly code: Extract<TransformationErrorCode, "BUDGET_EXHAUSTED" | "PROVIDER_CIRCUIT_OPEN" | "DEADLINE_EXCEEDED">,
    public readonly retryable: boolean,
    public readonly retryAfterMs?: number,
  ) {
    super(code);
    this.name = "TransformProviderSafetyError";
  }
}

function dayStart(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/** Equal-jitter delay protects a degraded provider without deterministic retry storms. */
export function providerRetryDelay(attempt: number, random = Math.random) {
  const cap = Math.min(PROVIDER_SAFETY_POLICY.retryBaseMs * 2 ** attempt, PROVIDER_SAFETY_POLICY.retryCapMs);
  return Math.round(cap / 2 + random() * (cap / 2));
}

type ProviderAdmission = { allowed: true } | { allowed: false; error: TransformProviderSafetyError };

/** Reserve the maximum response-token allowance before each upstream call. */
export async function reserveProviderAttempt(): Promise<ProviderAdmission> {
  const db = await getDb();
  if (!db) return { allowed: false, error: new TransformProviderSafetyError("PROVIDER_CIRCUIT_OPEN", true, 5_000) };
  try {
    return await db.transaction(async tx => {
      await tx.execute(sql`SELECT id FROM transform_control_locks WHERE id = 'global' FOR UPDATE`);
      const now = new Date();
      const circuit = await tx.select().from(providerCircuitStates).where(eq(providerCircuitStates.providerKey, PROVIDER_KEY)).limit(1);
      const openUntil = circuit[0]?.openUntil;
      if (openUntil && openUntil.getTime() > now.getTime()) {
        return { allowed: false, error: new TransformProviderSafetyError("PROVIDER_CIRCUIT_OPEN", true, openUntil.getTime() - now.getTime()) } as const;
      }

      const today = dayStart(now);
      const window = await tx.select().from(providerSpendWindows).where(eq(providerSpendWindows.dayStart, today)).limit(1);
      const reserved = window[0]?.reservedTokens ?? 0;
      if (reserved + PROVIDER_SAFETY_POLICY.estimatedCompletionTokens > PROVIDER_SAFETY_POLICY.dailyReservedTokenBudget) {
        const nextDay = today.getTime() + 86_400_000;
        return { allowed: false, error: new TransformProviderSafetyError("BUDGET_EXHAUSTED", false, nextDay - now.getTime()) } as const;
      }

      if (window[0]) {
        await tx.update(providerSpendWindows).set({
          reservedTokens: reserved + PROVIDER_SAFETY_POLICY.estimatedCompletionTokens,
          requestCount: window[0].requestCount + 1,
          updatedAt: now,
        }).where(eq(providerSpendWindows.dayStart, today));
      } else {
        await tx.insert(providerSpendWindows).values({
          dayStart: today,
          reservedTokens: PROVIDER_SAFETY_POLICY.estimatedCompletionTokens,
          requestCount: 1,
        });
      }
      return { allowed: true } as const;
    });
  } catch (error) {
    console.error("[Provider safety] Reservation failed", error instanceof Error ? error.name : "unknown");
    return { allowed: false, error: new TransformProviderSafetyError("PROVIDER_CIRCUIT_OPEN", true, 5_000) };
  }
}

/** Update health state with outcome metadata only; neither prompt nor user text is stored. */
export async function recordProviderOutcome(success: boolean) {
  const db = await getDb();
  if (!db) return;
  try {
    await db.transaction(async tx => {
      await tx.execute(sql`SELECT id FROM transform_control_locks WHERE id = 'global' FOR UPDATE`);
      const existing = await tx.select().from(providerCircuitStates).where(eq(providerCircuitStates.providerKey, PROVIDER_KEY)).limit(1);
      const now = new Date();
      if (success) {
        if (existing[0]) {
          await tx.update(providerCircuitStates).set({ consecutiveFailures: 0, openUntil: null, updatedAt: now }).where(eq(providerCircuitStates.providerKey, PROVIDER_KEY));
        } else {
          await tx.insert(providerCircuitStates).values({ providerKey: PROVIDER_KEY, consecutiveFailures: 0 });
        }
        return;
      }
      const failures = (existing[0]?.consecutiveFailures ?? 0) + 1;
      const openUntil = failures >= PROVIDER_SAFETY_POLICY.failureThreshold
        ? new Date(now.getTime() + PROVIDER_SAFETY_POLICY.circuitCooldownMs)
        : null;
      if (existing[0]) {
        await tx.update(providerCircuitStates).set({ consecutiveFailures: failures, openUntil, updatedAt: now }).where(eq(providerCircuitStates.providerKey, PROVIDER_KEY));
      } else {
        await tx.insert(providerCircuitStates).values({ providerKey: PROVIDER_KEY, consecutiveFailures: failures, openUntil });
      }
    });
  } catch (error) {
    console.error("[Provider safety] Outcome recording failed", error instanceof Error ? error.name : "unknown");
  }
}
