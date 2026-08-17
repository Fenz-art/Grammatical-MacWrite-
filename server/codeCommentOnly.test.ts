import { describe, expect, it } from "vitest";
import { assessStructurePreservation, parseStructuredDocument, reconstructStructuredDocument } from "../shared/structuredDocument";

describe("opt-in code-comment-only transformation", () => {
  const source = "```ts\n// improve retry copy\nconst id = \"MAC-42\";\nremaining = id + 1;\n```\n";

  it("keeps every code byte immutable by default and exposes no editable units", () => {
    expect(parseStructuredDocument(source).units).toHaveLength(0);
  });

  it("exposes only full-line comment bodies when comment mode is enabled", () => {
    const document = parseStructuredDocument(source, { transformCodeComments: true });
    expect(document.units).toEqual([expect.objectContaining({ text: "improve retry copy", nodeType: "code-comment" })]);
  });

  it("reconstructs transformed comments without mutating surrounding code", () => {
    const document = parseStructuredDocument(source, { transformCodeComments: true });
    const transformed = Object.fromEntries(document.units.map(unit => [unit.id, "Improve the retry flow"]));
    const result = reconstructStructuredDocument(document, transformed);
    expect(result).toContain("// Improve the retry flow");
    expect(result).toContain("const id = \"MAC-42\";");
    expect(result).toContain("remaining = id + 1;");
    expect(assessStructurePreservation(source, result, { transformCodeComments: true }).preserved).toBe(true);
  });
});
