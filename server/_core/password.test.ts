import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./password";

describe("password hashing", () => {
  it("stores passwords as salted scrypt hashes and verifies them", async () => {
    const password = "correct horse battery staple";
    const firstHash = await hashPassword(password);
    const secondHash = await hashPassword(password);

    expect(firstHash).not.toBe(password);
    expect(firstHash).not.toBe(secondHash);
    await expect(verifyPassword(password, firstHash)).resolves.toBe(true);
    await expect(verifyPassword("incorrect password", firstHash)).resolves.toBe(false);
  });

  it("rejects malformed or unsupported hash encodings", async () => {
    await expect(verifyPassword("password", "not-a-hash")).resolves.toBe(false);
  });
});