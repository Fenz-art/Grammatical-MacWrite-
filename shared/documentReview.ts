import { inferPassageSemanticContext } from "./semanticContext";

export const WRITING_PROFILE_IDS = ["professional", "concise", "friendly", "academic", "technical"] as const;

export type WritingProfileId = (typeof WRITING_PROFILE_IDS)[number];

export type WritingProfile = {
  id: WritingProfileId;
  label: string;
  description: string;
  instruction: string;
};

export const WRITING_PROFILES: Record<WritingProfileId, WritingProfile> = {
  professional: { id: "professional", label: "Professional", description: "Clear, polished, and business-ready", instruction: "Use a clear, professional, direct tone. Prefer precise wording and restrained claims." },
  concise: { id: "concise", label: "Concise", description: "Remove unnecessary words while retaining meaning", instruction: "Prioritize concise, high-signal writing. Remove redundancy but preserve every material qualification and detail." },
  friendly: { id: "friendly", label: "Friendly", description: "Warm, natural, and approachable", instruction: "Use a warm, natural, respectful voice without becoming casual, vague, or overly enthusiastic." },
  academic: { id: "academic", label: "Academic", description: "Formal, structured, and evidence-conscious", instruction: "Use a formal, structured, evidence-conscious register. Preserve uncertainty, attribution, and disciplinary terminology." },
  technical: { id: "technical", label: "Technical", description: "Precise, structured, and terminology-safe", instruction: "Use precise technical language. Preserve terminology, identifiers, interfaces, constraints, code-like tokens, and operational detail." },
};

export const PROTECTED_TERM_GLOSSARY_VERSION = 1 as const;

export type ProtectedTermGlossary = {
  schemaVersion: typeof PROTECTED_TERM_GLOSSARY_VERSION;
  exportedAt: string;
  profileId: WritingProfileId;
  protectedTerms: string[];
};

export type GlossaryParseResult =
  | { valid: true; glossary: ProtectedTermGlossary }
  | { valid: false; error: string };

export type ProtectedTermSuggestionReason = "named-entity" | "technical-term" | "url" | "identifier" | "recurring-phrase";

export type ProtectedTermSuggestion = {
  term: string;
  reason: ProtectedTermSuggestionReason;
  evidence: string;
};

export function normalizeProtectedTerms(values: string[]) {
  return Array.from(new Set(values.map(value => value.trim()).filter(Boolean))).slice(0, 50);
}

export function createProtectedTermGlossary(profileId: WritingProfileId, protectedTerms: string[]): ProtectedTermGlossary {
  return { schemaVersion: PROTECTED_TERM_GLOSSARY_VERSION, exportedAt: new Date().toISOString(), profileId, protectedTerms: normalizeProtectedTerms(protectedTerms) };
}

export function parseProtectedTermGlossary(value: unknown): GlossaryParseResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { valid: false, error: "Glossary JSON must be an object." };
  const glossary = value as Partial<ProtectedTermGlossary>;
  if (glossary.schemaVersion !== PROTECTED_TERM_GLOSSARY_VERSION) return { valid: false, error: `Unsupported glossary schema version. Expected ${PROTECTED_TERM_GLOSSARY_VERSION}.` };
  if (!glossary.profileId || !Object.hasOwn(WRITING_PROFILES, glossary.profileId)) return { valid: false, error: "Glossary contains an unknown writing profile." };
  if (!Array.isArray(glossary.protectedTerms) || glossary.protectedTerms.some(term => typeof term !== "string" || term.trim().length === 0 || term.length > 180)) return { valid: false, error: "Glossary terms must be non-empty strings of at most 180 characters." };
  if (glossary.protectedTerms.length > 50) return { valid: false, error: "Glossaries can contain at most 50 protected terms." };
  return { valid: true, glossary: { schemaVersion: PROTECTED_TERM_GLOSSARY_VERSION, exportedAt: typeof glossary.exportedAt === "string" ? glossary.exportedAt : new Date(0).toISOString(), profileId: glossary.profileId, protectedTerms: normalizeProtectedTerms(glossary.protectedTerms) } };
}

export function detectProtectedTermSuggestions(text: string, existingTerms: string[] = []): ProtectedTermSuggestion[] {
  const seen = new Set(normalizeProtectedTerms(existingTerms).map(term => term.toLocaleLowerCase()));
  const suggestions: ProtectedTermSuggestion[] = [];
  const add = (term: string, reason: ProtectedTermSuggestionReason, evidence: string) => {
    const normalized = term.trim().replace(/^`|`$/g, "");
    const key = normalized.toLocaleLowerCase();
    if (!normalized || /[-_./:]$/.test(normalized) || normalized.length > 180 || seen.has(key) || suggestions.some(item => item.term.toLocaleLowerCase() === key)) return;
    suggestions.push({ term: normalized, reason, evidence: evidence.slice(0, 180) });
  };
  const context = inferPassageSemanticContext(text);
  context.entities.filter(entity => entity.confidence >= 0.6).forEach(entity => add(entity.name, entity.type === "unknown" ? "technical-term" : "named-entity", entity.evidence[0] ?? entity.name));
  for (const url of text.match(/https?:\/\/[^\s)<\]]+/g) ?? []) add(url, "url", url);
  for (const token of text.match(/`[^`\n]+`|\b[A-Z]{2,}(?:-[A-Z0-9]+)*\b|\b[A-Za-z][\w.-]*[A-Z][\w.-]*\b|\b[A-Za-z]+-\d+\b/g) ?? []) add(token, "identifier", token);
  (text.match(/\b(?:API|SDK|CLI|repository|database|pipeline|dataset|telemetry|endpoint|schema|runtime|provider|stream|terminal|service|model)\b/gi) ?? []).forEach(term => add(term, "technical-term", term));
  const phrases = text.match(/\b(?:[A-Z][a-z]+\s+){1,3}[A-Z][a-z]+\b/g) ?? [];
  phrases.forEach(term => {
    const occurrences = (text.match(new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) ?? []).length;
    if (occurrences > 1) add(term, "recurring-phrase", `${occurrences} occurrences`);
  });
  return suggestions.slice(0, 16);
}

export type DocumentContext = {
  documentId: string;
  title?: string;
  blockIndex: number;
  blockCount: number;
  totalCharacters: number;
  beforeExcerpt?: string;
  afterExcerpt?: string;
  profileId?: WritingProfileId;
};

export type SemanticRisk = {
  id: string;
  severity: "info" | "warning";
  title: string;
  explanation: string;
  protectedValues: string[];
  resolved: boolean;
};

type SemanticCheckLike = {
  dimension: string;
  protectedValues: string[];
  preserved: boolean;
};

const labelForDimension: Record<string, string> = {
  numbers: "Numeric facts",
  dates: "Dates",
  urls: "Links",
  code: "Code and identifiers",
  terminology: "Protected terminology",
  negation: "Negation",
  modality: "Certainty and modality",
  quantifiers: "Quantifiers",
  "emoji-specialchar": "Meaningful symbols",
  whitespace: "Meaningful whitespace",
  "entity-context": "Entity and role context",
  structure: "Document structure",
};

export function explainSemanticRisks(checks: SemanticCheckLike[], context?: DocumentContext): SemanticRisk[] {
  const risks = checks
    .filter(check => check.protectedValues.length > 0 || !check.preserved)
    .map((check, index) => {
      const label = labelForDimension[check.dimension] ?? check.dimension;
      const sample = check.protectedValues.slice(0, 3).join(" · ");
      const resolved = check.preserved;
      return {
        id: `${check.dimension}-${index}`,
        severity: resolved ? "info" : "warning",
        title: resolved ? `${label} preserved` : `${label} needs review`,
        explanation: resolved
          ? `${sample || "No extracted values"} remained consistent with the source.`
          : `${sample || "One or more protected values"} did not survive the proposed transformation. The source should be retained.`,
        protectedValues: check.protectedValues,
        resolved,
      } satisfies SemanticRisk;
    });
  if (context?.profileId) {
    const profile = WRITING_PROFILES[context.profileId];
    risks.unshift({ id: "writing-profile", severity: "info", title: `${profile.label} profile applied`, explanation: profile.description, protectedValues: [], resolved: true });
  }
  if (context && context.blockCount > 1) {
    risks.unshift({ id: "document-context", severity: "info", title: `Document context carried across ${context.blockCount} blocks`, explanation: `Block ${context.blockIndex + 1} used bounded neighboring context to keep terminology and references consistent.`, protectedValues: [], resolved: true });
  }
  return risks;
}

export type ChangeKind = "unchanged" | "addition" | "deletion" | "replacement";

export type ReviewSegment = {
  id: string;
  kind: ChangeKind;
  source: string;
  proposed: string;
  accepted: boolean;
};

export type DocumentReview = {
  sourceText: string;
  proposedText: string;
  segments: ReviewSegment[];
  stale?: boolean;
  finalizedAt?: string;
};

const tokenise = (text: string) => text.match(/\s+|[^\s]+/g) ?? [];

function fallbackSegments(source: string[], proposed: string[]) {
  let prefix = 0;
  while (prefix < source.length && prefix < proposed.length && source[prefix] === proposed[prefix]) prefix += 1;
  let suffix = 0;
  while (suffix < source.length - prefix && suffix < proposed.length - prefix && source[source.length - 1 - suffix] === proposed[proposed.length - 1 - suffix]) suffix += 1;
  return [
    ...(prefix ? [{ kind: "unchanged" as const, source: source.slice(0, prefix).join(""), proposed: source.slice(0, prefix).join("") }] : []),
    { kind: "replacement" as const, source: source.slice(prefix, source.length - suffix).join(""), proposed: proposed.slice(prefix, proposed.length - suffix).join("") },
    ...(suffix ? [{ kind: "unchanged" as const, source: source.slice(source.length - suffix).join(""), proposed: source.slice(source.length - suffix).join("") }] : []),
  ].filter(segment => segment.source || segment.proposed);
}

function lcsSegments(source: string[], proposed: string[]) {
  if (source.length * proposed.length > 900_000) return fallbackSegments(source, proposed);
  const rows = source.length + 1;
  const columns = proposed.length + 1;
  const matrix = Array.from({ length: rows }, () => new Uint16Array(columns));
  for (let sourceIndex = source.length - 1; sourceIndex >= 0; sourceIndex -= 1) {
    for (let proposedIndex = proposed.length - 1; proposedIndex >= 0; proposedIndex -= 1) {
      matrix[sourceIndex][proposedIndex] = source[sourceIndex] === proposed[proposedIndex]
        ? matrix[sourceIndex + 1][proposedIndex + 1] + 1
        : Math.max(matrix[sourceIndex + 1][proposedIndex], matrix[sourceIndex][proposedIndex + 1]);
    }
  }
  const segments: Array<Pick<ReviewSegment, "kind" | "source" | "proposed">> = [];
  let deletions: string[] = [];
  let additions: string[] = [];
  const flushChange = () => {
    if (!deletions.length && !additions.length) return;
    segments.push({ kind: deletions.length && additions.length ? "replacement" : deletions.length ? "deletion" : "addition", source: deletions.join(""), proposed: additions.join("") });
    deletions = [];
    additions = [];
  };
  let sourceIndex = 0;
  let proposedIndex = 0;
  while (sourceIndex < source.length || proposedIndex < proposed.length) {
    if (source[sourceIndex] === proposed[proposedIndex]) {
      flushChange();
      const value = source[sourceIndex];
      const previous = segments.at(-1);
      if (previous?.kind === "unchanged") previous.source += value, previous.proposed += value;
      else segments.push({ kind: "unchanged", source: value, proposed: value });
      sourceIndex += 1;
      proposedIndex += 1;
    } else if (proposedIndex >= proposed.length || (sourceIndex < source.length && matrix[sourceIndex + 1][proposedIndex] >= matrix[sourceIndex][proposedIndex + 1])) {
      deletions.push(source[sourceIndex] ?? "");
      sourceIndex += 1;
    } else {
      additions.push(proposed[proposedIndex] ?? "");
      proposedIndex += 1;
    }
  }
  flushChange();
  return segments;
}

export function createDocumentReview(sourceText: string, proposedText: string): DocumentReview {
  const segments = lcsSegments(tokenise(sourceText), tokenise(proposedText))
    .map((segment, index) => ({ ...segment, id: `change-${index + 1}`, accepted: true }));
  return { sourceText, proposedText, segments };
}

export function updateReviewSegment(review: DocumentReview, id: string, accepted: boolean): DocumentReview {
  return { ...review, stale: false, finalizedAt: undefined, segments: review.segments.map(segment => segment.id === id ? { ...segment, accepted } : segment) };
}

export function selectAllReviewSegments(review: DocumentReview, accepted: boolean): DocumentReview {
  return { ...review, stale: false, finalizedAt: undefined, segments: review.segments.map(segment => segment.kind === "unchanged" ? segment : { ...segment, accepted }) };
}

export function finalizeDocumentReview(review: DocumentReview, finalizedAt = new Date().toISOString()): DocumentReview {
  return { ...review, stale: false, finalizedAt };
}

export function reopenDocumentReview(review: DocumentReview): DocumentReview {
  return { ...review, finalizedAt: undefined };
}

export function reviewedText(review: DocumentReview) {
  return review.segments.map(segment => {
    if (segment.kind === "unchanged") return segment.source;
    if (segment.kind === "addition") return segment.accepted ? segment.proposed : "";
    if (segment.kind === "deletion") return segment.accepted ? "" : segment.source;
    return segment.accepted ? segment.proposed : segment.source;
  }).join("");
}

export function reviewSummary(review: DocumentReview) {
  const changes = review.segments.filter(segment => segment.kind !== "unchanged");
  return { total: changes.length, accepted: changes.filter(segment => segment.accepted).length, reverted: changes.filter(segment => !segment.accepted).length };
}
