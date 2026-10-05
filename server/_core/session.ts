import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { ForbiddenError } from "@shared/_core/errors";
import { parse as parseCookieHeader } from "cookie";
import type { Request } from "express";
import { SignJWT, jwtVerify } from "jose";
import type { User } from "../db";
import * as db from "../db";
import { ENV } from "./env";

class SessionService {
  private getSecret() {
    if (!ENV.cookieSecret) throw new Error("JWT_SECRET must be configured");
    if (ENV.isProduction && ENV.cookieSecret.length < 32) {
      throw new Error("JWT_SECRET must be at least 32 characters in production");
    }
    return new TextEncoder().encode(ENV.cookieSecret);
  }

  async createSessionToken(user: Pick<User, "openId" | "name">) {
    return new SignJWT({ openId: user.openId })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setIssuedAt()
      .setExpirationTime(Math.floor((Date.now() + ONE_YEAR_MS) / 1000))
      .sign(this.getSecret());
  }

  private async getOpenId(token: string) {
    try {
      const { payload } = await jwtVerify(token, this.getSecret(), {
        algorithms: ["HS256"],
      });
      return typeof payload.openId === "string" ? payload.openId : null;
    } catch {
      return null;
    }
  }

  async authenticateRequest(req: Request): Promise<User> {
    const token = parseCookieHeader(req.headers.cookie ?? "")[COOKIE_NAME];
    const openId = token ? await this.getOpenId(token) : null;
    if (!openId) throw ForbiddenError("A valid sign-in session is required");

    const user = await db.getUserByOpenId(openId);
    if (!user) throw ForbiddenError("The signed-in account no longer exists");
    return user;
  }
}

export const sessionService = new SessionService();