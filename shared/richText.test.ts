import { describe, expect, it } from "vitest";
import { plainTextFromRichHtml, richHtmlFromPlainText } from "./richText";

describe("rich output serialization", () => {
  it("safely converts streamed plain text into editable HTML", () => {
    expect(richHtmlFromPlainText("A < B\nC & D")).toBe("A &lt; B<br />C &amp; D");
  });

  it("creates the plain-text projection used by copy-output from edited HTML", () => {
    expect(plainTextFromRichHtml("<strong>Accepted</strong><br /><span style=\"color:red\">output</span>")).toBe("Accepted\noutput");
  });
});
