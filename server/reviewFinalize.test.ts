import { describe, expect, it } from "vitest";
import {
  createDocumentReview,
  finalizeDocumentReview,
  reopenDocumentReview,
  reviewedText,
  reviewSummary,
  selectAllReviewSegments,
  updateReviewSegment,
} from "../shared/documentReview";

describe("review finalization gating and provenance", () => {
  it("reopens a finalized review and can be finalized again", () => {
    const review = createDocumentReview("hello world", "Hello, world.");
    const finalized = finalizeDocumentReview(review, "2026-08-17T00:00:00.000Z");
    expect(finalized.finalizedAt).toBe("2026-08-17T00:00:00.000Z");
    const reopened = reopenDocumentReview(finalized);
    expect(reopened.finalizedAt).toBeUndefined();
    const refinalized = finalizeDocumentReview(reopened);
    expect(refinalized.finalizedAt).toBeDefined();
  });

  it("clears finalization provenance as soon as any decision changes", () => {
    const review = createDocumentReview("helo world", "Hello world.");
    const finalized = finalizeDocumentReview(review, "2026-08-17T00:00:00.000Z");
    const change = finalized.segments.find(segment => segment.kind !== "unchanged");
    expect(change).toBeDefined();
    const changed = updateReviewSegment(finalized, change!.id, false);
    expect(changed.finalizedAt).toBeUndefined();
  });

  it("applies selective accept/reject decisions to the reviewed output", () => {
    const review = createDocumentReview("Hi there.", "Hello there.");
    expect(reviewedText(review)).toBe("Hello there.");
    const rejected = selectAllReviewSegments(review, false);
    expect(reviewedText(rejected)).toBe("Hi there.");
    expect(reviewSummary(rejected)).toMatchObject({ accepted: 0 });
    expect(reviewSummary(selectAllReviewSegments(review, true))).toMatchObject({ accepted: 1 });
  });
});
