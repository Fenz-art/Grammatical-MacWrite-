export const SEMANTIC_ENTITY_TYPES = [
  "human",
  "ai-system",
  "organization",
  "object",
  "data-stream",
  "unknown",
] as const;

export type SemanticEntityType = (typeof SEMANTIC_ENTITY_TYPES)[number];

export type SemanticEntity = {
  name: string;
  type: SemanticEntityType;
  roles: string[];
  evidence: string[];
  confidence: number;
};

export type PassageSemanticContext = {
  entities: SemanticEntity[];
  relations: string[];
  sentenceCount: number;
};

const NAME_PATTERN = new RegExp("\\b[A-Z][\\p{L}\\p{M}'’-]{1,}(?:\\s+[A-Z][\\p{L}\\p{M}'’-]{1,})*", "gu");
const SENTENCE_PATTERN = new RegExp("[^.!?\\n]+[.!?]?", "gu");

function classify(name: string, sentence: string): SemanticEntityType {
  const lower = sentence.toLocaleLowerCase();
  if (/\b(ai|artificial intelligence|llm|model|bot|agent|chatgpt|gpt)\b/.test(lower) && lower.includes(name.toLocaleLowerCase())) return "ai-system";
  if (/\b(stream|pipeline|feed|dataset|data|telemetry|event stream|message stream)\b/.test(lower)) return "data-stream";
  if (/\b(company|corporation|inc\.?|ltd\.?|organization|team|department|university|institute)\b/.test(lower)) return "organization";
  if (/\b(i am|i'm|i m|he is|she is|they are|person|human|developer|engineer|writer|student|doctor|manager)\b/.test(lower)) return "human";
  if (/\b(device|service|system|engine|object|file|terminal|computer|database|server)\b/.test(lower)) return "object";
  return "unknown";
}

function isLikelyNamedEntity(name: string, sentence: string) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const selfIntroduction = new RegExp(`\\b(?:i am|i'm|i m|my name is|called)\\s+${escaped}\\b`, "i").test(sentence);
  const thirdPersonReference = new RegExp(`\\b(?:he is|she is|they are|named)\\s+${escaped}\\b`, "i").test(sentence);
  const internalCapital = /[A-Z].*[A-Z]/.test(name) || /[A-Z][a-z]+[A-Z]/.test(name);
  const organizationSuffix = /\b(?:inc|ltd|corp|corporation|university|institute)$/i.test(name);
  return selfIntroduction || thirdPersonReference || internalCapital || organizationSuffix;
}

function rolesFor(sentence: string): string[] {
  const matches = sentence.match(/\b(?:software engineer|software engine|engineer|developer|writer|student|doctor|manager|person|human|service|system|model|agent|data stream|pipeline)\b/gi) ?? [];
  const roles = matches.map(value => value.toLocaleLowerCase() === "software engine" ? "software engineer" : value.toLocaleLowerCase());
  return Array.from(new Set(roles));
}

export function inferPassageSemanticContext(text: string): PassageSemanticContext {
  const sentences = text.match(SENTENCE_PATTERN) ?? (text ? [text] : []);
  const entities = new Map<string, SemanticEntity>();
  const addEntity = (name: string, sentence: string) => {
    const normalized = name.trim().replace(/^(?:I am|I'm|I m)\s+/i, "");
    if (!normalized || new RegExp("^(The|This|That|I|A|An|It|We|They|He|She)$").test(normalized)) return;
    const type = classify(normalized, sentence);
    const existing = entities.get(normalized);
    const evidence = [sentence.trim()].filter(Boolean);
    entities.set(normalized, {
      name: normalized,
      type: existing?.type !== "unknown" ? existing?.type ?? type : type,
      roles: Array.from(new Set([...(existing?.roles ?? []), ...rolesFor(sentence)])),
      evidence: Array.from(new Set([...(existing?.evidence ?? []), ...evidence])).slice(0, 3),
      confidence: Math.min(0.98, (existing?.confidence ?? 0.55) + (type === "unknown" ? 0.05 : 0.18)),
    });
  };
  for (const sentence of sentences) {
    for (const name of sentence.match(NAME_PATTERN) ?? []) {
      if (isLikelyNamedEntity(name, sentence)) addEntity(name, sentence);
    }
  }
  const technicalTerms = text.match(/\b(?:server|pipeline|data stream|stream|dataset|model|terminal|database|service|object)\b/gi) ?? [];
  for (const term of technicalTerms) {
    const evidenceSentence = sentences.find(sentence => sentence.toLocaleLowerCase().includes(term.toLocaleLowerCase())) ?? text;
    addEntity(term, evidenceSentence);
  }
  for (const entity of Array.from(entities.values())) {
    if (entity.type === "human" && new RegExp(`\\b(?:I am|I'm|I m|he is|she is|they are)\\s+${entity.name}\\b`, "i").test(text)) {
      entity.roles = Array.from(new Set([...entity.roles, ...rolesFor(text)]));
      entity.evidence = Array.from(new Set([...entity.evidence, text.trim()])).slice(0, 3);
      entity.confidence = Math.min(0.98, entity.confidence + 0.12);
    }
  }
  const relations = sentences
    .filter(sentence => /\b(i am|i'm|is|are|works as|uses|contains|feeds|sends|receives)\b/i.test(sentence))
    .map(sentence => sentence.trim())
    .slice(0, 8);
  return { entities: Array.from(entities.values()), relations, sentenceCount: sentences.length };
}

export function formatPassageSemanticContext(context: PassageSemanticContext): string {
  const entityText = context.entities.length
    ? context.entities.map(entity => `${entity.name} [${entity.type}; roles=${entity.roles.join(",") || "none"}; confidence=${entity.confidence.toFixed(2)}]`).join("; ")
    : "none detected";
  const relationText = context.relations.length ? context.relations.join(" | ") : "none detected";
  return `Sentences=${context.sentenceCount}. Entities=${entityText}. Context relations=${relationText}. Treat this as evidence, not as permission to invent facts.`;
}
