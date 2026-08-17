import { describe, expect, it } from "vitest";
import { buildDownloadAllText, outputFilename, pasteWrapperLabel, splitPasteBlocks } from "../shared/pasteBlocks";

describe("large paste blocks", () => {
  it("splits oversized input at readable boundaries and preserves content order", () => {
    const input = `${"A".repeat(4_500)}\n\n${"B".repeat(4_500)}\n\n${"C".repeat(4_500)}`;
    const blocks = splitPasteBlocks(input);
    expect(blocks.length).toBe(6);
    expect(blocks.map(block => block.text).join("").replace(/\s+/g, "")).toBe(input.replace(/\s+/g, ""));
    expect(blocks[0]?.charCount).toBeLessThanOrEqual(3_200);
  });

  it("splits an 8,952-character block before provider submission", () => {
    const input = "Meaningful sentence. ".repeat(426);
    expect(input.length).toBe(8_946);
    const blocks = splitPasteBlocks(input);
    expect(blocks.length).toBe(3);
    expect(Math.max(...blocks.map(block => block.charCount))).toBeLessThanOrEqual(3_200);
    expect(blocks.map(block => block.text).join("")).toBe(input);
  });

  it("prefers sentence endings and line breaks over arbitrary cuts", () => {
    const sentenceText = "First complete sentence. Second complete sentence. Third complete sentence. Fourth complete sentence.";
    const sentenceBlocks = splitPasteBlocks(sentenceText, 52);
    expect(sentenceBlocks.length).toBeGreaterThan(1);
    expect(sentenceBlocks.slice(0, -1).every(block => /[.!?][\\"'”’»)]*\s*$/.test(block.text))).toBe(true);

    const lineText = "Line one with enough words to fill the first section.\nLine two should begin after the newline boundary.\nLine three finishes the sample.";
    const lineBlocks = splitPasteBlocks(lineText, 62);
    expect(lineBlocks.length).toBeGreaterThan(1);
    expect(lineBlocks[0]?.text.endsWith("\n") || /[.!?]\\s*$/.test(lineBlocks[0]?.text ?? "")).toBe(true);
  });

  it("preserves emoji graphemes, mixed scripts, symbols, punctuation, and whitespace exactly", () => {
    const input = "  👨‍👩‍👧‍👦 café — مرحبًا 世界?! C++ & API\n\nNext line…  \n";
    const blocks = splitPasteBlocks(input, 24);
    expect(blocks.map(block => block.text).join("")).toBe(input.replace(/\r\n/g, "\n"));
    expect(blocks.every(block => !/\uD800|\uDC00/.test(block.text))).toBe(true);
    expect(blocks.map(block => block.charCount).reduce((sum, count) => sum + count, 0)).toBeGreaterThan(0);
  });

  it("creates compact wrapper metadata and deterministic output names", () => {
    expect(pasteWrapperLabel({ index: 1, charCount: 2_493, lineCount: 504 })).toBe("[Pasted text #2 · 2,493 chars · 504 lines]");
    expect(outputFilename(0)).toBe("output1.txt");
    expect(outputFilename(2)).toBe("output3.txt");
  });

  it("assembles Download all text in block order", () => {
    const text = buildDownloadAllText([{ index: 1, text: "second" }, { index: 0, text: "first" }]);
    expect(text).toContain("===== output1.txt =====");
    expect(text).toContain("first\n\n===== output2.txt =====");
  });

  it("keeps UTF-8 content intact in Download all assembly", () => {
    const text = buildDownloadAllText([{ index: 0, text: "🚀 café — مرحبًا 世界" }, { index: 1, text: "C++\tready" }]);
    expect(text).toContain("🚀 café — مرحبًا 世界");
    expect(text).toContain("C++\tready");
  });
});
