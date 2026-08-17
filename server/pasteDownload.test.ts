import { describe, expect, it } from "vitest";
import { buildDownloadAllText, outputFilename } from "../shared/pasteBlocks";

describe("per-block outputs and combined Download all", () => {
  it("derives deterministic per-block filenames in display order", () => {
    expect(outputFilename(0)).toBe("output1.txt");
    expect(outputFilename(11)).toBe("output12.txt");
    expect(outputFilename(49)).toBe("output50.txt");
  });

  it("assembles Download all in ascending block order regardless of input order", () => {
    const text = buildDownloadAllText([
      { index: 2, text: "third" },
      { index: 0, text: "first" },
      { index: 1, text: "second" },
    ]);
    const first = text.indexOf("first");
    const second = text.indexOf("second");
    const third = text.indexOf("third");
    expect(first).toBeGreaterThan(-1);
    expect(second).toBeGreaterThan(first);
    expect(third).toBeGreaterThan(second);
    expect(text).toContain("===== output1.txt =====");
    expect(text).toContain("===== output3.txt =====");
  });

  it("keeps Unicode, tabs, and multi-line content intact in the combined download", () => {
    const text = buildDownloadAllText([
      { index: 0, text: "  👨‍👩‍👧‍👦 café — مرحبًا 世界\nnext line" },
      { index: 1, text: "C++\tready…" },
    ]);
    expect(text).toContain("👨‍👩‍👧‍👦 café — مرحبًا 世界");
    expect(text).toContain("C++\tready…");
    expect(text).toContain("\nnext line\n");
  });
});
