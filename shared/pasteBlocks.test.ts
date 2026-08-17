import { describe, expect, it } from "vitest";
import { buildDownloadAllText, outputFilename, pasteWrapperLabel, splitPasteBlocks } from "./pasteBlocks";

describe("large paste blocks", () => {
  it("splits oversized input at readable boundaries and preserves content order", () => {
    const input = `${"A".repeat(4_500)}\n\n${"B".repeat(4_500)}\n\n${"C".repeat(4_500)}`;
    const blocks = splitPasteBlocks(input);
    expect(blocks.length).toBe(3);
    expect(blocks.map(block => block.text).join("\n\n")).toBe(input);
    expect(blocks[0]?.charCount).toBe(4_500);
  });

  it("creates compact wrapper metadata and deterministic output names", () => {
    expect(pasteWrapperLabel({ index: 1, charCount: 2_493, lineCount: 504 })).toBe("[Pasted text #2 · 2,493 chars · 504 lines]");
    expect(outputFilename(0)).toBe("output.txt");
    expect(outputFilename(2)).toBe("output3.txt");
  });

  it("assembles Download all text in block order", () => {
    expect(buildDownloadAllText([{ index: 1, text: "second" }, { index: 0, text: "first" }])).toContain("output.txt");
    expect(buildDownloadAllText([{ index: 1, text: "second" }, { index: 0, text: "first" })).toContain("first\n\n===== output2.txt =====");
  });
});
