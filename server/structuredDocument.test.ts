import { describe, expect, it } from "vitest";
import { assessStructurePreservation, parseStructuredDocument, reconstructStructuredDocument } from "../shared/structuredDocument";

describe("structured document preservation", () => {
  const prDescription = `## What changed
This PR improve the retry copy for users.

Run \`pnpm test\` before merging.

\`\`\`ts
const retry = await client.retry({ id: "MAC-42" });
\`\`\`

| Area | Status |
| --- | --- |
| Queue | Ready |

See [release notes](https://example.com/releases).

pnpm test

tree-sitter-typescript
tree-sitter-javascript
`;

  it("keeps GitHub PR syntax, code, commands, table framing, URLs, and card items byte-for-byte while exposing prose and labels", () => {
    const document = parseStructuredDocument(prDescription);
    expect(document.hasStructure).toBe(true);
    expect(document.immutableLabels).toEqual(expect.arrayContaining(["fenced code block", "Markdown table divider", "runnable command", "technical card item"]));
    expect(document.segments.some(segment => segment.nodeType === "table-row")).toBe(true);
    expect(document.units.some(unit => unit.nodeType === "table-cell")).toBe(true);
    expect(document.units.some(unit => unit.text.includes("This PR improve"))).toBe(true);
    expect(document.units.some(unit => unit.text === "release notes")).toBe(true);
    expect(document.units.some(unit => unit.text.includes("MAC-42"))).toBe(false);
  });

  it("reconstructs transformed inner prose without changing protected outer structure", () => {
    const document = parseStructuredDocument(prDescription);
    const transformed = Object.fromEntries(document.units.map(unit => [unit.id, unit.text.replace("This PR improve", "This PR improves").replace("retry copy", "retry flow")]));
    const result = reconstructStructuredDocument(document, transformed);
    expect(result).toContain("This PR improves the retry flow for users.");
    expect(result).toContain("```ts\nconst retry = await client.retry({ id: \"MAC-42\" });\n```");
    expect(result).toContain("| --- | --- |");
    expect(result).toContain("[release notes](https://example.com/releases)");
    expect(result).toContain("pnpm test\n\ntree-sitter-typescript\ntree-sitter-javascript");
    expect(assessStructurePreservation(prDescription, result)).toMatchObject({ preserved: true });
  });

  it("flags a candidate that removes a fenced code region even when its prose remains readable", () => {
    const broken = prDescription.replace("```ts\nconst retry = await client.retry({ id: \"MAC-42\" });\n```\n", "");
    expect(assessStructurePreservation(prDescription, broken).preserved).toBe(false);
  });

  it("keeps every code byte immutable by default but exposes only full-line comment bodies when comment mode is enabled", () => {
    const source = "```ts\n// improve retry copy\nconst id = \"MAC-42\";\n# not a TypeScript comment marker but retained as text\n```\n";
    expect(parseStructuredDocument(source).units).toHaveLength(0);
    const document = parseStructuredDocument(source, { transformCodeComments: true });
    expect(document.units).toEqual([expect.objectContaining({ text: "improve retry copy", nodeType: "code-comment" }), expect.objectContaining({ text: "not a TypeScript comment marker but retained as text", nodeType: "code-comment" })]);
    const transformed = Object.fromEntries(document.units.map(unit => [unit.id, unit.text === "improve retry copy" ? "Improve the retry flow" : unit.text]));
    const result = reconstructStructuredDocument(document, transformed);
    expect(result).toContain("// Improve the retry flow");
    expect(result).toContain("const id = \"MAC-42\";");
    expect(result).toContain("# not a TypeScript comment marker but retained as text");
    expect(assessStructurePreservation(source, result, { transformCodeComments: true }).preserved).toBe(true);
  });
});
