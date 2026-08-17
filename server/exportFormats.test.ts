import { describe, expect, it } from "vitest";
import { changeReportToMarkdown, richHtmlToMarkdownText, semanticAnalysisToMarkdown } from "../client/src/lib/exportFormats";
import { createDocumentReview, finalizeDocumentReview, updateReviewSegment } from "../shared/documentReview";

describe("export format helpers", () => {
  it("keeps Unicode content and multi-paragraph structure in Markdown", () => {
    const html = "<p>🚀 café — مرحبًا 世界</p><p><strong>C++</strong>\tready…</p>";
    const markdown = richHtmlToMarkdownText(html);
    expect(markdown).toContain("🚀 café — مرحبًا 世界");
    expect(markdown).toContain("C++");
    expect(markdown).toContain("ready…");
    expect(markdown).toContain("\n\n");
  });

  it("does not drop punctuation or ampersands from rich output", () => {
    const markdown = richHtmlToMarkdownText("<p>Use C++ &amp; Rust — safely?!</p>");
    expect(markdown).toContain("C++ & Rust — safely?!");
  });

  it("exports semantic analysis as readable Markdown without losing Unicode evidence", () => {
    const markdown = semanticAnalysisToMarkdown({
      sentenceCount: 2,
      entities: [{ name: "Pratyush", type: "human", roles: ["software engineer"], evidence: ["Pratyush builds 🚀 systems in café environments."], confidence: 0.91 }],
      relations: ["Pratyush builds 🚀 systems in café environments."],
    }, "Rewrite output");
    expect(markdown).toContain("# Semantic analysis — Rewrite output");
    expect(markdown).toContain("Pratyush");
    expect(markdown).toContain("software engineer");
    expect(markdown).toContain("91%");
    expect(markdown).toContain("🚀 systems in café environments");
  });

  it("exports a Unicode-safe change report that distinguishes accepted from reverted edits", () => {
    const initial = createDocumentReview("Helo 🚀, GraphQL is fast.", "Hello 🚀, GraphQL is fast.");
    const change = initial.segments.find(segment => segment.kind !== "unchanged");
    const review = finalizeDocumentReview(change ? updateReviewSegment(initial, change.id, false) : initial, "2026-08-17T00:00:00.000Z");
    const markdown = changeReportToMarkdown({ title: "API note", review, profileLabel: "Technical", risks: [{ id: "term", severity: "info", title: "Protected terminology preserved", explanation: "GraphQL remained unchanged.", protectedValues: ["GraphQL"], resolved: true }] });
    expect(markdown).toContain("# Change report — API note");
    expect(markdown).toContain("Helo 🚀, GraphQL is fast.");
    expect(markdown).toContain("reverted");
    expect(markdown).toContain("Protected terminology preserved");
    expect(markdown).toContain("Finalized selective review");
    expect(markdown).toContain("2026-08-17T00:00:00.000Z");
  });
});
