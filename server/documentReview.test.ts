import { describe, expect, it } from "vitest";
import { createDocumentReview, createProtectedTermGlossary, detectProtectedTermSuggestions, explainSemanticRisks, finalizeDocumentReview, parseProtectedTermGlossary, reviewSummary, reviewedText, selectAllReviewSegments, updateReviewSegment } from "../shared/documentReview";

describe("document review contracts", () => {
  it("reconstructs the proposal, then restores source text when a replacement is reverted", () => {
    const review = createDocumentReview("Helo Pratyush 👋", "Hello Pratyush 👋");
    expect(reviewedText(review)).toBe("Hello Pratyush 👋");
    const change = review.segments.find(segment => segment.kind !== "unchanged");
    expect(change).toBeDefined();
    const reverted = updateReviewSegment(review, change!.id, false);
    expect(reviewedText(reverted)).toBe("Helo Pratyush 👋");
    expect(reviewSummary(reverted)).toMatchObject({ total: 1, accepted: 0, reverted: 1 });
  });

  it("applies selective decisions without disturbing unchanged whitespace or Unicode", () => {
    const review = createDocumentReview("Use  GraphQL 🚀 today.", "Use GraphQL 🚀 today.");
    const reverted = selectAllReviewSegments(review, false);
    expect(reviewedText(reverted)).toBe("Use  GraphQL 🚀 today.");
    expect(reviewedText(selectAllReviewSegments(review, true))).toBe("Use GraphQL 🚀 today.");
  });

  it("creates concise resolved and warning risk explanations from deterministic checks", () => {
    const risks = explainSemanticRisks([
      { dimension: "terminology", protectedValues: ["GraphQL"], preserved: true },
      { dimension: "negation", protectedValues: ["not"], preserved: false },
    ], { documentId: "doc-1", blockIndex: 1, blockCount: 2, totalCharacters: 6800, profileId: "technical" });
    expect(risks.some(risk => risk.title === "Technical profile applied")).toBe(true);
    expect(risks.some(risk => risk.title === "Protected terminology preserved" && risk.resolved)).toBe(true);
    expect(risks.some(risk => risk.title === "Negation needs review" && risk.severity === "warning")).toBe(true);
  });

  it("round-trips a portable glossary with a profile preference and normalizes duplicate terms", () => {
    const glossary = createProtectedTermGlossary("technical", ["GraphQL", "MAC-42", "GraphQL"]);
    const parsed = parseProtectedTermGlossary(JSON.parse(JSON.stringify(glossary)));
    expect(parsed).toMatchObject({ valid: true, glossary: { profileId: "technical", protectedTerms: ["GraphQL", "MAC-42"] } });
  });

  it("rejects malformed or unsupported glossary imports", () => {
    expect(parseProtectedTermGlossary({ schemaVersion: 9, profileId: "technical", protectedTerms: [] })).toMatchObject({ valid: false });
    expect(parseProtectedTermGlossary({ schemaVersion: 1, profileId: "unknown", protectedTerms: ["GraphQL"] })).toMatchObject({ valid: false });
    expect(parseProtectedTermGlossary({ schemaVersion: 1, profileId: "technical", protectedTerms: [""] })).toMatchObject({ valid: false });
  });

  it("suggests unprotected URLs, identifiers, and technical terms without mutating existing glossary values", () => {
    const suggestions = detectProtectedTermSuggestions("Pratyush updated the Grammatical SDK at https://example.com/api for MAC-42. The pipeline sends telemetry through the API.", ["Grammatical"]);
    expect(suggestions.map(item => item.term)).toEqual(expect.arrayContaining(["https://example.com/api", "MAC-42", "SDK", "pipeline"]));
    expect(suggestions.map(item => item.term)).not.toContain("Grammatical");
  });

  it("records finalization provenance until an individual decision changes", () => {
    const review = createDocumentReview("helo world", "Hello world.");
    const finalized = finalizeDocumentReview(review, "2026-08-17T00:00:00.000Z");
    expect(finalized.finalizedAt).toBe("2026-08-17T00:00:00.000Z");
    const changed = updateReviewSegment(finalized, finalized.segments.find(segment => segment.kind !== "unchanged")!.id, false);
    expect(changed.finalizedAt).toBeUndefined();
  });
});
