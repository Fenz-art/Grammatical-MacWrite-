import { BookOpenCheck, Download, FileCode2, Plus, ScanSearch, Tag, Upload, X } from "lucide-react";
import { type ChangeEvent, useRef, useState } from "react";
import { detectProtectedTermSuggestions, parseProtectedTermGlossary, WRITING_PROFILES, type ProtectedTermSuggestion, type WritingProfileId } from "@shared/documentReview";
import { downloadProtectedTermGlossary } from "@/lib/exportFormats";
import { toast } from "sonner";
import "./DocumentReviewSettingsPanel.css";

type DocumentReviewSettingsPanelProps = {
  title: string;
  profileId: WritingProfileId;
  protectedTerms: string[];
  sourceText: string;
  codeCommentOnly: boolean;
  onTitleChange: (title: string) => void;
  onProfileChange: (profileId: WritingProfileId) => void;
  onProtectedTermsChange: (terms: string[]) => void;
  onCodeCommentOnlyChange: (enabled: boolean) => void;
  onClose: () => void;
};

function normalizeTerms(value: string) {
  return Array.from(new Set(value.split(/[\n,]/).map(term => term.trim()).filter(Boolean))).slice(0, 50);
}

export function DocumentReviewSettingsPanel({ title, profileId, protectedTerms, sourceText, codeCommentOnly, onTitleChange, onProfileChange, onProtectedTermsChange, onCodeCommentOnlyChange, onClose }: DocumentReviewSettingsPanelProps) {
  const [draftTerms, setDraftTerms] = useState("");
  const [suggestions, setSuggestions] = useState<ProtectedTermSuggestion[] | null>(null);
  const glossaryInputRef = useRef<HTMLInputElement>(null);
  const addTerms = () => {
    const next = normalizeTerms(draftTerms);
    if (!next.length) return;
    onProtectedTermsChange(Array.from(new Set([...protectedTerms, ...next])).slice(0, 50));
    setDraftTerms("");
  };
  const importGlossary = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const result = parseProtectedTermGlossary(JSON.parse(await file.text()));
      if (!result.valid) return toast.error(result.error);
      onProfileChange(result.glossary.profileId);
      onProtectedTermsChange(result.glossary.protectedTerms);
      toast.success(`Imported ${result.glossary.protectedTerms.length} protected term${result.glossary.protectedTerms.length === 1 ? "" : "s"} and the ${WRITING_PROFILES[result.glossary.profileId].label} profile.`);
    } catch {
      toast.error("Choose a valid Grammatical glossary JSON file.");
    }
  };
  return <aside className="overlay-panel review-settings-overlay" aria-label="Document review settings">
    <div className="review-settings-header"><div><strong><BookOpenCheck size={15} /> Document review</strong><span>Local preferences for the current document</span></div><button onClick={onClose} aria-label="Close document review settings"><X size={15} /></button></div>
    <label className="review-field"><span>Document title</span><input value={title} onChange={event => onTitleChange(event.target.value)} placeholder="Untitled document" maxLength={120} /></label>
    <div className="review-field"><span>Writing profile</span><div className="writing-profile-grid">{Object.values(WRITING_PROFILES).map(profile => <button key={profile.id} className={profileId === profile.id ? "writing-profile is-active" : "writing-profile"} onClick={() => onProfileChange(profile.id)}><strong>{profile.label}</strong><small>{profile.description}</small></button>)}</div></div>
    <div className="review-field"><span><FileCode2 size={13} /> Code comments</span><label className="code-comment-switch"><input type="checkbox" checked={codeCommentOnly} onChange={event => onCodeCommentOnlyChange(event.target.checked)} /><span>Transform natural-language comments inside fenced code</span></label><p>All executable code, comment markers, commands, identifiers, and code fences remain untouched. Only full-line <code>//</code>, <code>#</code>, <code>--</code>, <code>;</code>, and <code>*</code> comment bodies become eligible.</p></div>
    <div className="review-field"><span><Tag size={13} /> Protected terms</span><p>Names, acronyms, product terms, and identifiers are preserved exactly through the prompt and semantic guard.</p><div className="protected-term-entry"><input value={draftTerms} onChange={event => setDraftTerms(event.target.value)} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); addTerms(); } }} placeholder="Add terms, separated by commas" maxLength={500} /><button onClick={addTerms} aria-label="Add protected terms"><Plus size={15} /></button></div><div className="suggestion-actions"><button onClick={() => { const next = detectProtectedTermSuggestions(sourceText, protectedTerms); setSuggestions(next); if (!next.length) toast.info("No additional protected terms were detected in the current document."); }} disabled={!sourceText.trim()}><ScanSearch size={13} /> Auto-detect</button>{suggestions?.length ? <button onClick={() => { onProtectedTermsChange(Array.from(new Set([...protectedTerms, ...suggestions.map(item => item.term)])).slice(0, 50)); setSuggestions([]); }}><Plus size={13} /> Accept all suggestions</button> : null}</div>{suggestions?.length ? <div className="protected-term-suggestions">{suggestions.map(suggestion => <button key={suggestion.term} onClick={() => { onProtectedTermsChange(Array.from(new Set([...protectedTerms, suggestion.term])).slice(0, 50)); setSuggestions(current => current?.filter(item => item.term !== suggestion.term) ?? []); }}><strong>{suggestion.term}</strong><small>{suggestion.reason.replace("-", " ")} · {suggestion.evidence}</small><Plus size={12} /></button>)}</div> : null}{protectedTerms.length ? <div className="protected-term-list">{protectedTerms.map(term => <span key={term}>{term}<button onClick={() => onProtectedTermsChange(protectedTerms.filter(value => value !== term))} aria-label={`Remove protected term ${term}`}><X size={11} /></button></span>)}</div> : <p className="review-settings-empty">No protected terms yet.</p>}<div className="glossary-actions"><button onClick={() => { const download = downloadProtectedTermGlossary(profileId, protectedTerms); toast.success(`Downloaded ${download.filename}`); }}><Download size={13} /> Export glossary</button><button onClick={() => glossaryInputRef.current?.click()}><Upload size={13} /> Import glossary</button><input ref={glossaryInputRef} className="glossary-file-input" type="file" accept="application/json,.json" onChange={importGlossary} /></div></div>
  </aside>;
}
