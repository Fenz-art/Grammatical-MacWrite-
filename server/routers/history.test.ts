import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "../_core/context";

const store = vi.hoisted(() => new Map<string, any>());

vi.mock("../db", () => ({
  createTransformationHistory: vi.fn(async (record: any) => {
    store.set(record.id, { ...record, createdAt: new Date(), updatedAt: new Date() });
    return store.get(record.id);
  }),
  listTransformationHistory: vi.fn(async (userOpenId: string, search?: string) => Array.from(store.values()).filter(record => {
    if (record.userOpenId !== userOpenId) return false;
    if (!search) return true;
    return `${record.title} ${record.inputText} ${record.outputText}`.toLowerCase().includes(search.toLowerCase());
  })),
  updateTransformationHistory: vi.fn(async (userOpenId: string, id: string, outputHtml: string, outputText: string) => {
    const record = store.get(id);
    if (record?.userOpenId === userOpenId) store.set(id, { ...record, outputHtml, outputText });
  }),
  deleteTransformationHistory: vi.fn(async (userOpenId: string, id: string) => {
    const record = store.get(id);
    if (record?.userOpenId === userOpenId) store.delete(id);
  }),
}));

import { appRouter } from "../routers";
import { historyRouter } from "./history";

function createContext(user: TrpcContext["user"]): TrpcContext {
  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

const user = (openId: string): NonNullable<TrpcContext["user"]> => ({
  id: 1,
  openId,
  email: `${openId}@example.com`,
  name: openId,
  loginMethod: "test",
  role: "user",
  createdAt: new Date(),
  updatedAt: new Date(),
  lastSignedIn: new Date(),
});

beforeEach(() => store.clear());

describe("history router", () => {
  it("exposes list, create, update, and delete procedures", () => {
    expect(historyRouter._def.procedures.list).toBeDefined();
    expect(historyRouter._def.procedures.create).toBeDefined();
    expect(historyRouter._def.procedures.update).toBeDefined();
    expect(historyRouter._def.procedures.delete).toBeDefined();
  });

  it("rejects unauthenticated history access", async () => {
    const caller = appRouter.createCaller(createContext(null));
    await expect(caller.history.list()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("creates, searches, updates, and deletes only the authenticated owner record", async () => {
    const ownerCaller = appRouter.createCaller(createContext(user("owner-history-test")));
    const otherCaller = appRouter.createCaller(createContext(user("other-history-test")));
    const id = "11111111-1111-4111-8111-111111111111";
    const sessionId = "22222222-2222-4222-8222-222222222222";
    await ownerCaller.history.create({ id, sessionId, mode: "proofread", title: "Unicode launch", inputText: "🚀 café", outputHtml: "<p>🚀 café</p>", outputText: "🚀 café", blockCount: 1 });
    expect(await ownerCaller.history.list({ search: "café" })).toHaveLength(1);
    expect(await otherCaller.history.list({ search: "café" })).toHaveLength(0);
    await ownerCaller.history.update({ id, outputHtml: "<p>🚀 café — edited</p>", outputText: "🚀 café — edited" });
    expect((await ownerCaller.history.list({ search: "edited" }))[0]?.outputText).toContain("edited");
    await otherCaller.history.delete({ id });
    expect(await ownerCaller.history.list()).toHaveLength(1);
    await ownerCaller.history.delete({ id });
    expect(await ownerCaller.history.list()).toHaveLength(0);
  });

  it("validates record identifiers before persistence", async () => {
    const caller = appRouter.createCaller(createContext(user("validation-history-test")));
    await expect(caller.history.delete({ id: "not-a-uuid" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(caller.history.update({ id: "not-a-uuid", outputHtml: "<p>x</p>", outputText: "x" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});
