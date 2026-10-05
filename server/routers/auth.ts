import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createUserAccount, findUserByEmail, updateUserLastSignedIn } from "../db";
import { getSessionCookieOptions } from "../_core/cookies";
import { hashPassword, verifyPassword } from "../_core/password";
import { sessionService } from "../_core/session";
import { publicProcedure, router } from "../_core/trpc";
import type { TrpcContext } from "../_core/context";

const credentialsSchema = z.object({
  email: z.string().trim().email().max(320).transform(value => value.toLowerCase()),
  password: z.string().min(8).max(128),
});

function setSessionCookie(ctx: Pick<TrpcContext, "req" | "res">, token: string) {
  ctx.res.cookie(COOKIE_NAME, token, {
    ...getSessionCookieOptions(ctx.req),
    maxAge: ONE_YEAR_MS,
  });
}

export const authRouter = router({
  me: publicProcedure.query(({ ctx }) => {
    const user = ctx.user;
    if (!user) return null;
    return {
      id: user.id,
      openId: user.openId,
      email: user.email,
      name: user.name,
      role: user.role,
    };
  }),
  signUp: publicProcedure
    .input(credentialsSchema.extend({ name: z.string().trim().max(100).optional() }))
    .mutation(async ({ ctx, input }) => {
      if (await findUserByEmail(input.email)) {
        throw new TRPCError({ code: "CONFLICT", message: "An account with this email already exists" });
      }

      try {
        const user = await createUserAccount({
          email: input.email,
          name: input.name || null,
          passwordHash: await hashPassword(input.password),
        });
        const token = await sessionService.createSessionToken(user);
        setSessionCookie(ctx, token);
        return { success: true } as const;
      } catch (error) {
        if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
          throw new TRPCError({ code: "CONFLICT", message: "An account with this email already exists" });
        }
        throw error;
      }
    }),
  signIn: publicProcedure
    .input(credentialsSchema)
    .mutation(async ({ ctx, input }) => {
      const user = await findUserByEmail(input.email);
      if (!user?.passwordHash || !(await verifyPassword(input.password, user.passwordHash))) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Email or password is incorrect" });
      }

      await updateUserLastSignedIn(user.id);
      const token = await sessionService.createSessionToken(user);
      setSessionCookie(ctx, token);
      return { success: true } as const;
    }),
  logout: publicProcedure.mutation(({ ctx }) => {
    const cookieOptions = getSessionCookieOptions(ctx.req);
    ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
    return { success: true } as const;
  }),
});

export type AuthRouter = typeof authRouter;