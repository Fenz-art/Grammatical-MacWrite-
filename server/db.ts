import { and, desc, eq, like, or } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertTransformationHistory, InsertUser, transformationHistory, users } from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

export async function createTransformationHistory(record: InsertTransformationHistory) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.insert(transformationHistory).values(record);
  const rows = await db.select().from(transformationHistory).where(eq(transformationHistory.id, record.id)).limit(1);
  return rows[0];
}

export async function listTransformationHistory(userOpenId: string, search?: string) {
  const db = await getDb();
  if (!db) return [];
  const normalized = search?.trim();
  const userFilter = eq(transformationHistory.userOpenId, userOpenId);
  const filter = normalized
    ? and(userFilter, or(like(transformationHistory.title, `%${normalized}%`), like(transformationHistory.inputText, `%${normalized}%`), like(transformationHistory.outputText, `%${normalized}%`)))
    : userFilter;
  return db.select().from(transformationHistory).where(filter).orderBy(desc(transformationHistory.createdAt)).limit(100);
}

export async function updateTransformationHistory(userOpenId: string, id: string, outputHtml: string, outputText: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.update(transformationHistory).set({ outputHtml, outputText }).where(and(eq(transformationHistory.id, id), eq(transformationHistory.userOpenId, userOpenId)));
}

export async function deleteTransformationHistory(userOpenId: string, id: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const result = await db.delete(transformationHistory).where(and(eq(transformationHistory.id, id), eq(transformationHistory.userOpenId, userOpenId)));
  return result;
}
