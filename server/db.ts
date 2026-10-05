import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { ENV } from "./_core/env";

export type { User, TransformationHistory } from "@prisma/client";

const globalForPrisma = globalThis as typeof globalThis & {
  prisma?: PrismaClient;
};

let _db: PrismaClient | null = globalForPrisma.prisma ?? null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = new PrismaClient();
      globalForPrisma.prisma = _db;
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function findUserByEmail(email: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  return db.user.findUnique({ where: { email } });
}

export async function createUserAccount(input: {
  email: string;
  name: string | null;
  passwordHash: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  return db.user.create({
    data: {
      openId: randomUUID(),
      email: input.email,
      name: input.name,
      passwordHash: input.passwordHash,
      loginMethod: "password",
      role: input.email === ENV.ownerEmail ? "admin" : "user",
    },
  });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  return db.user.findUnique({ where: { openId } });
}

export async function updateUserLastSignedIn(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  return db.user.update({ where: { id }, data: { lastSignedIn: new Date() } });
}

export async function createTransformationHistory(record: {
  id: string;
  userOpenId: string;
  sessionId: string;
  mode: "proofread" | "improve" | "natural" | "rewrite";
  title: string;
  inputText: string;
  outputHtml: string;
  outputText: string;
  blockCount: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");

  return db.transformationHistory.create({ data: record });
}

export async function listTransformationHistory(userOpenId: string, search?: string) {
  const db = await getDb();
  if (!db) return [];

  const normalized = search?.trim();

  return db.transformationHistory.findMany({
    where: normalized
      ? {
          userOpenId,
          OR: [
            { title: { contains: normalized, mode: "insensitive" } },
            { inputText: { contains: normalized, mode: "insensitive" } },
            { outputText: { contains: normalized, mode: "insensitive" } },
          ],
        }
      : { userOpenId },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
}

export async function updateTransformationHistory(userOpenId: string, id: string, outputHtml: string, outputText: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");

  await db.transformationHistory.updateMany({
    where: { id, userOpenId },
    data: { outputHtml, outputText },
  });
}

export async function deleteTransformationHistory(userOpenId: string, id: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");

  return db.transformationHistory.deleteMany({
    where: { id, userOpenId },
  });
}
