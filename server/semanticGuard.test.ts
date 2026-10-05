import { describe, expect, it } from "vitest";
import { runSemanticGuard } from "./semanticGuard";

describe("runSemanticGuard", () => {
  it("accepts an improved sentence when protected values and terms stay intact", () => {
    const result = runSemanticGuard(
      "PostgreSQL may process 10,000 requests on August 16, 2026.",
      "PostgreSQL may process 10,000 requests on August 16, 2026."
    );
    expect(result.accepted).toBe(true);
  });

  it("rejects numerical, modality, and terminology drift", () => {
    const result = runSemanticGuard(
      "PostgreSQL may process 10,000 requests.",
      "The database will process 1,000 requests."
    );
    expect(result.accepted).toBe(false);
    expect(result.checks.find(check => check.dimension === "numbers")?.preserved).toBe(false);
    expect(result.checks.find(check => check.dimension === "modality")?.preserved).toBe(false);
    expect(result.checks.find(check => check.dimension === "terminology")?.preserved).toBe(false);
  });

  it("preserves meaningful emoji, Unicode punctuation, symbols, and mixed scripts", () => {
    const source = "Keep 👨‍👩‍👧‍👦 café — مرحبًا 世界?! C++ exactly.";
    const result = runSemanticGuard(source, "Keep 👨‍👩‍👧‍👦 café — مرحبًا 世界?! C++ exactly.");
    expect(result.accepted).toBe(true);
    expect(result.checks.find(check => check.dimension === "emoji-specialchar")?.preserved).toBe(true);
  });

  it("rejects loss of meaningful emoji-special characters or boundary whitespace", () => {
    const source = "  🚀 Launch — now?!  \n";
    const missingEmoji = runSemanticGuard(source, "  Launch — now?!  \n");
    expect(missingEmoji.accepted).toBe(false);
    expect(missingEmoji.checks.find(check => check.dimension === "emoji-specialchar")?.preserved).toBe(false);
    const missingWhitespace = runSemanticGuard(source, "🚀 Launch — now?!");
    expect(missingWhitespace.accepted).toBe(false);
    expect(missingWhitespace.checks.find(check => check.dimension === "whitespace")?.preserved).toBe(false);
  });

  it("preserves meaningful internal tabs and repeated spaces", () => {
    const source = "Key:\tvalue   with spacing.";
    const preserved = runSemanticGuard(source, source);
    expect(preserved.checks.find(check => check.dimension === "whitespace")?.preserved).toBe(true);
    const changed = runSemanticGuard(source, "Key: value with spacing.");
    expect(changed.accepted).toBe(false);
    expect(changed.checks.find(check => check.dimension === "whitespace")?.preserved).toBe(false);
  });

  it("protects user-supplied terminology", () => {
    const result = runSemanticGuard(
      "The service uses an internal database.",
      "The service uses PostgreSQL.",
      ["internal database"]
    );
    expect(result.accepted).toBe(false);
  });

  it("accepts a contextual human-role repair while preserving the named person", () => {
    const result = runSemanticGuard(
      "Helo I m Pratyush. I am a software engine.",
      "Hello, I'm Pratyush. I'm a software engineer."
    );
    expect(result.accepted).toBe(true);
    expect(result.checks.find(check => check.dimension === "entity-context")?.preserved).toBe(true);
  });

  it("does not treat Markdown prose after a fenced code block as protected inline code", () => {
    const source = "## Change\n\nThis PR improve retry copy.\n\nRun `pnpm test`.\n\n```ts\nconst id = \"MAC-42\";\n```\n\nSee the release notes.";
    const candidate = "## Change\n\nThis PR improves retry copy.\n\nRun `pnpm test`.\n\n```ts\nconst id = \"MAC-42\";\n```\n\nSee the release notes.";
    const result = runSemanticGuard(source, candidate, ["pnpm test"]);
    expect(result.accepted).toBe(true);
    expect(result.checks.find(check => check.dimension === "code")?.preserved).toBe(true);
  });
});
