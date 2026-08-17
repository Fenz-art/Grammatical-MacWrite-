import { describe, expect, it } from "vitest";
import { buildTransformMessages, splitIntoDisplayChunks } from "./textTransform";

describe("text transformation policy", () => {
  it.each(["proofread", "improve", "natural", "rewrite"] as const)("routes %s through a distinct active mode", mode => {
    const messages = buildTransformMessages("A sample sentence.", mode);
    expect(messages[0]?.content).toContain(`Active mode: ${mode.toUpperCase()}.`);
  });
  it("routes proofread to its conservative policy", () => {
    const messages = buildTransformMessages("This are test.", "proofread");
    expect(messages[0]?.content).toContain("Active mode: PROOFREAD.");
    expect(messages[0]?.content).toContain("Make only minimal edits.");
  });

  it("applies low, standard, and high intensity instructions without changing the mode contract", () => {
    expect(String(buildTransformMessages("A sample sentence.", "proofread", "low")[0]?.content)).toContain("Intensity: LOW.");
    expect(String(buildTransformMessages("A sample sentence.", "improve", "standard")[0]?.content)).toContain("Intensity: STANDARD.");
    expect(String(buildTransformMessages("A sample sentence.", "rewrite", "high")[0]?.content)).toContain("Intensity: HIGH.");
  });

  it("gives every mode passage-level entity and relationship context", () => {
    for (const mode of ["proofread", "improve", "natural", "rewrite"] as const) {
      const messages = buildTransformMessages("I am Pratyush. I am a software engine.", mode);
      const system = String(messages[0]?.content);
      expect(system).toContain("Reason at passage level");
      expect(system).toContain("entity");
      expect(system).toContain("software engineer");
      expect(system.toLowerCase()).toContain("do not invent");
    }
  });

  it("routes rewrite to its preservation-focused restructuring policy", () => {
    const messages = buildTransformMessages("The service is stable.", "rewrite");
    expect(messages[0]?.content).toContain("Active mode: REWRITE.");
    expect(messages[0]?.content).toContain("preserving facts");
  });

  it("grounds the provider request in a writing profile, protected terms, and bounded document context", () => {
    const system = String(buildTransformMessages("Use GraphQL in block two.", "improve", "standard", {
      protectedTerms: ["GraphQL", "MAC-42"],
      documentContext: { documentId: "doc-1", title: "Release plan", blockIndex: 1, blockCount: 3, totalCharacters: 9200, beforeExcerpt: "GraphQL powers the API.", afterExcerpt: "MAC-42 remains open.", profileId: "technical" },
    })[0]?.content);
    expect(system).toContain("Writing profile: Technical");
    expect(system).toContain("GraphQL · MAC-42");
    expect(system).toContain("block 2 of 3");
    expect(system).toContain("Preceding excerpt for consistency only: GraphQL powers the API.");
    expect(system).toContain("Following excerpt for consistency only: MAC-42 remains open.");
  });

  it("instructs every provider call to preserve Markdown and GitHub PR structure while editing only safe inner prose", () => {
    const system = String(buildTransformMessages("Improve this sentence.", "rewrite")[0]?.content);
    expect(system).toContain("Structured-source policy");
    expect(system).toContain("fenced-code delimiters");
    expect(system).toContain("link destinations");
    expect(system).toContain("transform only its human-readable wording");
  });

  it("uses a strict comment-body-only instruction when code-comment mode is active", () => {
    const system = String(buildTransformMessages("improve retry copy", "improve", "standard", { codeCommentOnly: true })[0]?.content);
    expect(system).toContain("Code-comment mode is active");
    expect(system).toContain("return only the comment body");
    expect(system).toContain("Never emit or change code");
  });
});

describe("splitIntoDisplayChunks", () => {
  it("preserves text while creating ordered display chunks", () => {
    const text = "The transformation stream should reveal complete output in readable, ordered pieces.";
    expect(splitIntoDisplayChunks(text, 18).join("")).toBe(text);
  });

  it("does not split emoji graphemes or surrogate pairs", () => {
    const text = "Start 👨‍👩‍👧‍👦 café — مرحبًا 世界 🚀 end.";
    const chunks = splitIntoDisplayChunks(text, 8);
    expect(chunks.join("")).toBe(text);
    expect(chunks.every(chunk => !/\uD800|\uDC00/.test(chunk))).toBe(true);
  });
});
