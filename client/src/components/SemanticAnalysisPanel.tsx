import type { PassageSemanticContext } from "@shared/semanticContext";
import type { SemanticAnalysisExportFormat } from "@/lib/exportFormats";
import { BrainCircuit, ChevronDown, Download, Link2, ScanSearch } from "lucide-react";
import "./SemanticAnalysisPanel.css";

const percent = (value: number) => `${Math.round(value * 100)}%`;

export function SemanticAnalysisPanel({ context, onExport }: { context: PassageSemanticContext; onExport: (format: SemanticAnalysisExportFormat) => void }) {
  const entityLabel = context.entities.length === 1 ? "entity" : "entities";
  return (
    <details className="semantic-analysis">
      <summary>
        <span className="semantic-analysis-title"><BrainCircuit size={14} /> Semantic analysis</span>
        <span className="semantic-analysis-summary">{context.entities.length} {entityLabel} · {context.sentenceCount} sentence{context.sentenceCount === 1 ? "" : "s"}</span>
        <ChevronDown className="semantic-analysis-chevron" size={14} />
      </summary>
      <div className="semantic-analysis-body">
        {context.entities.length ? (
          <div className="semantic-entity-grid">
            {context.entities.map(entity => (
              <article className="semantic-entity" key={`${entity.name}-${entity.type}`}>
                <div className="semantic-entity-heading"><strong>{entity.name}</strong><span className="semantic-type">{entity.type}</span></div>
                <div className="semantic-confidence"><span>Confidence</span><div aria-label={`${entity.name} confidence ${percent(entity.confidence)}`} className="semantic-confidence-track"><span style={{ width: `${Math.round(entity.confidence * 100)}%` }} /></div><strong>{percent(entity.confidence)}</strong></div>
                {entity.roles.length ? <p><b>Roles:</b> {entity.roles.join(", ")}</p> : <p><b>Roles:</b> none inferred</p>}
                {entity.evidence.length ? <p className="semantic-evidence"><ScanSearch size={13} /> {entity.evidence[0]}</p> : null}
              </article>
            ))}
          </div>
        ) : <p className="semantic-empty">No named or technical entities were confidently inferred from this output.</p>}
        {context.relations.length ? <div className="semantic-relations"><span><Link2 size={13} /> Context relations</span><ul>{context.relations.map(relation => <li key={relation}>{relation}</li>)}</ul></div> : null}
        <div className="semantic-export-actions" aria-label="Download semantic analysis"><button className="semantic-export" onClick={() => onExport("json")}><Download size={13} /> Download JSON</button><button className="semantic-export" onClick={() => onExport("markdown")}><Download size={13} /> Download Markdown</button></div>
      </div>
    </details>
  );
}
