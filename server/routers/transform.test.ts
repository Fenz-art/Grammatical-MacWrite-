import { describe, expect, it } from "vitest";
import { transformInputSchema, transformRouter } from "./transform";

describe("transform router", () => {
  it("exposes a typed stream procedure", () => {
    expect(transformRouter).toBeDefined();
  });

  it("accepts bounded document-review context and protected terminology at the subscription boundary", () => {
    const parsed = transformInputSchema.parse({
      requestId: "review-request",
      text: "GraphQL retry copy needs polish.",
      mode: "improve",
      intensity: "standard",
      protectedTerms: ["GraphQL", "MAC-42"],
      codeCommentOnly: true,
      documentContext: { documentId: "pr-42", title: "Retry PR", blockIndex: 1, blockCount: 3, totalCharacters: 5400, beforeExcerpt: "GraphQL retry logic.", afterExcerpt: "MAC-42 test coverage.", profileId: "technical" },
      clientRevision: 10,
    });
    expect(parsed.documentContext).toMatchObject({ documentId: "pr-42", blockIndex: 1, profileId: "technical" });
    expect(parsed.protectedTerms).toEqual(["GraphQL", "MAC-42"]);
    expect(parsed.codeCommentOnly).toBe(true);
  });

  it("rejects a document context whose block index lies outside the declared document", () => {
    expect(() => transformInputSchema.parse({
      requestId: "invalid-review-request",
      text: "Valid text.",
      mode: "improve",
      documentContext: { documentId: "pr-42", blockIndex: 2, blockCount: 2, totalCharacters: 10 },
      clientRevision: 10,
    })).toThrow(/Block index/);
  });
});
