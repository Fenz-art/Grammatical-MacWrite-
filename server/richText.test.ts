import { describe, expect, it } from "vitest";
import { plainTextFromRichHtml, richHtmlFromPlainText } from "../shared/richText";

describe("rich text Unicode round trips", () => {
  it("preserves emoji, mixed scripts, symbols, tabs, and line breaks", () => {
    const text = "  👨‍👩‍👧‍👦 café — مرحبًا 世界\tC++\nNext line…  ";
    expect(plainTextFromRichHtml(richHtmlFromPlainText(text))).toBe(text);
  });

  it("decodes common and numeric HTML entities without dropping Unicode", () => {
    expect(plainTextFromRichHtml("&lt;tag&gt; &amp; &#x1F680; &#x2014; &quot;ok&quot;")).toBe('<tag> & 🚀 — "ok"');
  });
});
