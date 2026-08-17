import { describe, expect, it } from "vitest";
import { createMarkdownPreviewState } from "../shared/markdownPreview";

describe("Markdown preview state", () => {
  it("maps raw Markdown to typed render metadata and protected-region evidence", () => {
    const source = "## Retry support\nSee [release notes](https://example.com).\n\n```ts\n// improve retry copy\nconst id = \"MAC-42\";\n```\n\n| Area | Status |\n| --- | --- |\n| Queue | Ready |\n";
    const preview = createMarkdownPreviewState(source);
    expect(preview.rawSource).toBe(source);
    expect(preview.blocks).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "heading", startLine: 1 }),
      expect.objectContaining({ kind: "paragraph", inlineKinds: ["link"] }),
      expect.objectContaining({ kind: "fenced-code", language: "ts" }),
      expect.objectContaining({ kind: "table" }),
    ]));
    expect(preview.protectedRegions).toEqual(expect.arrayContaining(["fenced code block", "Markdown table divider"]));
    expect(preview.protectedRegionCount).toBe(2);
  });
});
