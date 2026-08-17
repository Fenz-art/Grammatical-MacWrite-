import { Check, CheckCheck, FileDiff, LockKeyhole, ShieldAlert, Undo2 } from "lucide-react";
import { reviewSummary, selectAllReviewSegments, type DocumentReview, type SemanticRisk, updateReviewSegment } from "@shared/documentReview";
import "./TrackedChangesReview.css";

type TrackedChangesReviewProps = {
  review: DocumentReview;
  risks: SemanticRisk[];
  onChange: (review: DocumentReview) => void;
  onFinalize: (review: DocumentReview) => void;
  onReopen: (review: DocumentReview) => void;
};

export function TrackedChangesReview({ review, risks, onChange, onFinalize, onReopen }: TrackedChangesReviewProps) {
  const summary = reviewSummary(review);
  const changes = review.segments.filter(segment => segment.kind !== "unchanged");
  const finalized = Boolean(review.finalizedAt);
  return <section className="review-workspace" aria-label="Tracked changes review">
    <details className="semantic-risk-panel" open={risks.some(risk => risk.severity === "warning")}>
      <summary><span><ShieldAlert size={13} /> Semantic safety</span><small>{risks.filter(risk => risk.severity === "warning").length ? `${risks.filter(risk => risk.severity === "warning").length} needs review` : "Preservation evidence available"}</small></summary>
      <div className="semantic-risk-list">{risks.length ? risks.map(risk => <article key={risk.id} className={risk.severity === "warning" ? "semantic-risk is-warning" : "semantic-risk"}><span>{risk.resolved ? <Check size={13} /> : <ShieldAlert size={13} />}</span><div><strong>{risk.title}</strong><p>{risk.explanation}</p>{risk.protectedValues.length ? <small>{risk.protectedValues.slice(0, 5).join(" · ")}</small> : null}</div></article>) : <p>Grammatical found no additional document-level risks.</p>}</div>
    </details>
    <details className="tracked-changes" open>
      <summary><span><FileDiff size={14} /> Side-by-side review</span><small>{finalized ? "Finalized for export" : `${summary.total} decision${summary.total === 1 ? "" : "s"} pending finalization`}</small></summary>
      <div className="tracked-changes-body">{review.stale ? <p className="review-stale">Manual edits changed this output. Create a new transformation to refresh the diff snapshot.</p> : <><div className="review-actions"><button onClick={() => onChange(selectAllReviewSegments(review, true))} disabled={finalized}><CheckCheck size={13} /> Accept all</button><button onClick={() => onChange(selectAllReviewSegments(review, false))} disabled={finalized}><Undo2 size={13} /> Reject all</button>{finalized ? <button onClick={() => onReopen(review)}><Undo2 size={13} /> Reopen decisions</button> : <button className="review-finalize" onClick={() => onFinalize(review)}><LockKeyhole size={13} /> Finalize reviewed document</button>}</div>{changes.length ? <><div className="review-column-headings"><span>Original source</span><span>Proposed transformation</span><span>Decision</span></div><div className="review-change-list">{changes.map((segment, index) => <article className={segment.accepted ? "review-change is-accepted" : "review-change"} key={segment.id}><div className="review-change-count">{index + 1}</div><div className="review-source"><code>{segment.source || "—"}</code></div><div className="review-proposal"><code>{segment.proposed || "—"}</code></div><div className="review-decision"><button disabled={finalized || segment.accepted} onClick={() => onChange(updateReviewSegment(review, segment.id, true))}><Check size={12} /> Accept</button><button disabled={finalized || !segment.accepted} onClick={() => onChange(updateReviewSegment(review, segment.id, false))}><Undo2 size={12} /> Reject</button></div></article>)}</div></> : <p className="review-empty">No textual changes were proposed for this output.</p>}{finalized ? <p className="review-finalized"><LockKeyhole size={12} /> Finalized {new Date(review.finalizedAt!).toLocaleString()}. The exported document and report use these decisions.</p> : null}</>}</div>
    </details>
  </section>;
}
