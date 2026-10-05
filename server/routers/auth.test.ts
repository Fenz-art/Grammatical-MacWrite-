import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "../_core/context";
import { hashPassword } from "../_core/password";

const accountStore = vi.hoisted(() => new Map<string, any>());
const sessionToken = vi.hoisted(() => "test-session-token");

vi.mock("../db", () => ({
  findUserByEmail: vi.fn(async (email: string) => accountStore.get(email) ?? null),
  createUserAccount: vi.fn(async (input: { email: string; name: string | null; passwordHash: string }) => {
    const user = {
      id: accountStore.size + 1,
      openId: `local-${accountStore.size + 1}`,
      email: input.email,
      name: input.name,
      passwordHash: input.passwordHash,
      loginMethod: "password",
      role: "user",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    };
    accountStore.set(input.email, user);
    return user;
  }),
  updateUserLastSignedIn: vi.fn(async () => undefined),
  getUserByOpenId: vi.fn(async () => null),
  getDb: vi.fn(async () => null),
  createTransformationHistory: vi.fn(),
  listTransformationHistory: vi.fn(async () => []),
  updateTransformationHistory: vi.fn(),
  deleteTransformationHistory: vi.fn(),
}));

vi.mock("../_core/session", () => ({
  sessionService: {
    createSessionToken: vi.fn(async () => sessionToken),
  },
}));

import { appRouter } from "../routers";

function createContext(user: TrpcContext["user"] = null) {
  const cookies: Array<{ name: string; value: string; options: Record<string, unknown> }> = [];
  const ctx: TrpcContext = {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {
      cookie: (name: string, value: string, options: Record<string, unknown>) => cookies.push({ name, value, options }),
      clearCookie: () => undefined,
    } as TrpcContext["res"],
  };
  return { ctx, cookies };
}

beforeEach(() => accountStore.clear());

describe("manual auth router", () => {
  it("creates accounts with normalized email, a password hash, and an HTTP-only session cookie", async () => {
    const { ctx, cookies } = createContext();
    const caller = appRouter.createCaller(ctx);

    await expect(caller.auth.signUp({ email: "  USER@example.com ", name: "User", password: "correct horse" }))
      .resolves.toEqual({ success: true });

    const account = accountStore.get("user@example.com");
    expect(account.passwordHash).not.toBe("correct horse");
    expect(account.passwordHash).toMatch(/^scrypt\$/);
    expect(cookies).toHaveLength(1);
    expect(cookies[0]).toMatchObject({
      value: sessionToken,
      options: { httpOnly: true, sameSite: "lax", secure: true, path: "/" },
    });
  });

  it("authenticates correct credentials and rejects incorrect credentials", async () => {
    accountStore.set("signin@example.com", {
      id: 8,
      openId: "local-signin",
      email: "signin@example.com",
      name: null,
      passwordHash: await hashPassword("good password"),
      loginMethod: "password",
      role: "user",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    });
    const { ctx, cookies } = createContext();
    const caller = appRouter.createCaller(ctx);

    await expect(caller.auth.signIn({ email: "SIGNIN@example.com", password: "good password" }))
      .resolves.toEqual({ success: true });
    expect(cookies).toHaveLength(1);
    await expect(caller.auth.signIn({ email: "signin@example.com", password: "wrong password" }))
      .rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(cookies).toHaveLength(1);
  });

  it("does not expose stored password hashes through auth.me", async () => {
    const user = {
      id: 1,
      openId: "local-safe-output",
      email: "safe@example.com",
      name: "Safe User",
      passwordHash: "sensitive-hash",
      loginMethod: "password",
      role: "user",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    } as NonNullable<TrpcContext["user"]>;
    const caller = appRouter.createCaller(createContext(user).ctx);

    const result = await caller.auth.me();
    expect(result).toMatchObject({ id: 1, email: "safe@example.com", name: "Safe User" });
    expect(result).not.toHaveProperty("passwordHash");
  });
});