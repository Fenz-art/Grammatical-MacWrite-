import { boolean, index, int, mediumtext, mysqlEnum, mysqlTable, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Application-issued account identifier. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export const transformationHistory = mysqlTable("transformation_history", {
  id: varchar("id", { length: 36 }).primaryKey(),
  userOpenId: varchar("userOpenId", { length: 64 }).notNull(),
  sessionId: varchar("sessionId", { length: 36 }).notNull(),
  mode: mysqlEnum("mode", ["proofread", "improve", "natural", "rewrite"]).notNull(),
  title: varchar("title", { length: 180 }).notNull(),
  inputText: mediumtext("inputText").notNull(),
  outputHtml: mediumtext("outputHtml").notNull(),
  outputText: mediumtext("outputText").notNull(),
  blockCount: int("blockCount").notNull().default(1),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => ({
  userCreatedIdx: index("transformation_history_user_created_idx").on(table.userOpenId, table.createdAt),
  userSearchIdx: index("transformation_history_user_search_idx").on(table.userOpenId, table.title),
}));

export type TransformationHistory = typeof transformationHistory.$inferSelect;
export type InsertTransformationHistory = typeof transformationHistory.$inferInsert;

/** Privacy-safe counters used to enforce server-side transformation limits. */
export const transformUsageWindows = mysqlTable("transform_usage_windows", {
  id: int("id").autoincrement().primaryKey(),
  userOpenId: varchar("userOpenId", { length: 64 }).notNull(),
  windowType: mysqlEnum("windowType", ["minute", "day"]).notNull(),
  windowStart: timestamp("windowStart").notNull(),
  requestCount: int("requestCount").notNull().default(0),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => ({
  userWindowUnique: uniqueIndex("transform_usage_user_window_unique").on(table.userOpenId, table.windowType, table.windowStart),
  windowExpiryIdx: index("transform_usage_window_expiry_idx").on(table.windowType, table.windowStart),
}));

/** A single database lock serializes short control-plane admissions across autoscaled instances. */
export const transformControlLocks = mysqlTable("transform_control_locks", {
  id: varchar("id", { length: 32 }).primaryKey(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

/** Leases prevent more than the configured number of active provider transformations fleet-wide. */
export const transformConcurrencyLeases = mysqlTable("transform_concurrency_leases", {
  requestId: varchar("requestId", { length: 120 }).primaryKey(),
  userOpenId: varchar("userOpenId", { length: 64 }).notNull(),
  acquiredAt: timestamp("acquiredAt").defaultNow().notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
}, table => ({
  activeLeaseIdx: index("transform_concurrency_active_idx").on(table.expiresAt),
  userLeaseIdx: index("transform_concurrency_user_idx").on(table.userOpenId, table.expiresAt),
}));

/** Aggregated provider-call reservations used for a conservative, durable daily budget. */
export const providerSpendWindows = mysqlTable("provider_spend_windows", {
  dayStart: timestamp("dayStart").primaryKey(),
  reservedTokens: int("reservedTokens").notNull().default(0),
  requestCount: int("requestCount").notNull().default(0),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

/** Provider circuit state stores operational status only—never user text or prompts. */
export const providerCircuitStates = mysqlTable("provider_circuit_states", {
  providerKey: varchar("providerKey", { length: 96 }).primaryKey(),
  consecutiveFailures: int("consecutiveFailures").notNull().default(0),
  openUntil: timestamp("openUntil"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

/** Durable observability samples intentionally retain no source text, output text, prompt, or user identifier. */
export const transformMetricEvents = mysqlTable("transform_metric_events", {
  id: int("id").autoincrement().primaryKey(),
  at: timestamp("at").notNull(),
  elapsedMs: int("elapsedMs").notNull(),
  queueWaitMs: int("queueWaitMs").notNull().default(0),
  mode: mysqlEnum("mode", ["proofread", "improve", "natural", "rewrite"]).notNull(),
  intensity: mysqlEnum("intensity", ["low", "standard", "high"]).notNull(),
  outcome: mysqlEnum("outcome", ["accepted", "rejected", "error", "cancelled"]).notNull(),
  providerFailure: boolean("providerFailure").notNull().default(false),
  failureCode: varchar("failureCode", { length: 64 }),
}, table => ({
  eventTimeIdx: index("transform_metric_event_time_idx").on(table.at),
  outcomeTimeIdx: index("transform_metric_outcome_time_idx").on(table.outcome, table.at),
}));
