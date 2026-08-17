import type { SemanticCheck } from "../shared/transformations";
import { boundaryWhitespace, meaningfulUnicodeSpecials, preservesBoundaryWhitespace, preservesMeaningfulWhitespace } from "../shared/unicodeText";
import { inferPassageSemanticContext } from "../shared/semanticContext";
import { explainSemanticRisks, type DocumentContext } from "../shared/documentReview";
import { assessStructurePreservation } from "../shared/structuredDocument";

const unique = (values: string[]) => Array.from(new Set(values.filter(Boolean)));
const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function protectTerminology(original: string, userTerms: string[]) {
  const candidates = unique([
    ...userTerms.map(term => term.trim()).filter(Boolean),
    ...matchAll(original, /\b(?:[A-Z][A-Za-z0-9/+.-]{1,}|[A-Za-z]+[A-Z][A-Za-z0-9]*)\b/g),
  ]);
  return candidates.filter(value => {
    if (userTerms.some(term => term.trim().toLocaleLowerCase() === value.toLocaleLowerCase())) return true;
    const sentenceInitial = new RegExp(`(?:^|[.!?\\n])\\s*${escapeRegex(value)}\\b`).test(original);
    const hasInternalCapital = /[A-Z].*[A-Z]/.test(value) || /[A-Z][a-z]+[A-Z]/.test(value);
    return !sentenceInitial || hasInternalCapital;
  });
}

const matchAll = (text: string, pattern: RegExp) => {
  const matches: string[] = [];
  const matcher = new RegExp(pattern.source, pattern.flags);
  let match = matcher.exec(text);
  while (match) {
    matches.push(match[0]);
    match = matcher.exec(text);
  }
  return unique(matches);
};

const patterns = {
  numbers: /(?<![\w.])(?:[$€£₹]\s?)?\d{1,3}(?:,\d{3})*(?:\.\d+)?(?:\s?[%x])?(?![\w.])/g,
  dates:
    /\b(?:\d{4}-\d{2}-\d{2}|\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2}(?:,\s*\d{4})?)\b/gi,
  urls: /(?:https?:\/\/|www\.)[^\s)\]}>,]+/gi,
  code: /`[^`]+`|\b[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)+\b/g,
  negation: /\b(?:not|never|none|cannot|can't|won't|isn't|aren't|doesn't|don't|without)\b/gi,
  modality: /\b(?:may|might|could|should|must|will|would|can|shall)\b/gi,
  quantifiers: /\b(?:all|some|none|most|only|each|every|any|many|few|several|exactly|at\s+least)\b/gi,
};

function includesAll(candidate: string, protectedValues: string[]) {
  const lower = candidate.toLocaleLowerCase();
  return protectedValues.every(value => lower.includes(value.toLocaleLowerCase()));
}

export function runSemanticGuard(
  original: string,
  candidate: string,
  userTerms: string[] = [],
  documentContext?: DocumentContext,
  codeCommentOnly?: boolean
): { accepted: boolean; checks: SemanticCheck[]; risks: ReturnType<typeof explainSemanticRisks>; reason?: string } {
  const checks: SemanticCheck[] = Object.entries(patterns).map(([dimension, pattern]) => {
    const values = matchAll(original, pattern);
    const protectedValues = codeCommentOnly && dimension === "code"
      ? values.filter(value => !(value.includes("\n") && /^\s*[`~]/.test(value)))
      : values;
    return {
      dimension: dimension as SemanticCheck["dimension"],
      protectedValues,
      preserved: includesAll(candidate, protectedValues),
    };
  });

  const unicodeSpecials = meaningfulUnicodeSpecials(original);
  checks.push({
    dimension: "emoji-specialchar",
    protectedValues: unicodeSpecials,
    preserved: includesAll(candidate, unicodeSpecials),
  });

  const whitespace = boundaryWhitespace(original);
  checks.push({
    dimension: "whitespace",
    protectedValues: whitespace,
    preserved: preservesBoundaryWhitespace(original, candidate) && preservesMeaningfulWhitespace(original, candidate),
  });

  const structure = assessStructurePreservation(original, candidate, { transformCodeComments: codeCommentOnly });
  checks.push({
    dimension: "structure",
    protectedValues: structure.immutableLabels,
    preserved: structure.preserved,
  });

  const terminology = protectTerminology(original, userTerms);

  checks.push({
    dimension: "terminology",
    protectedValues: terminology,
    preserved: includesAll(candidate, terminology),
  });

  const context = inferPassageSemanticContext(original);
  const contextValues = context.entities.flatMap(entity => [entity.name, ...entity.roles]);
  const entityNamesPreserved = context.entities.every(entity => candidate.toLocaleLowerCase().includes(entity.name.toLocaleLowerCase()));
  const rolesPreserved = context.entities.every(entity => entity.roles.length === 0 || entity.roles.some(role => candidate.toLocaleLowerCase().includes(role.toLocaleLowerCase()) || (role === "software engineer" && /software\s+engine/.test(original.toLocaleLowerCase()) && /software\s+engineer/.test(candidate.toLocaleLowerCase()))));
  checks.push({
    dimension: "entity-context",
    protectedValues: unique(contextValues),
    preserved: entityNamesPreserved && rolesPreserved,
  });

  const failed = checks.filter(check => !check.preserved);
  const risks = explainSemanticRisks(checks, documentContext);
  return failed.length
    ? {
        accepted: false,
        checks,
        risks,
        reason: `Preservation check failed for ${failed
          .map(check => check.dimension)
          .join(", ")}.`,
      }
    : { accepted: true, checks, risks };
}
