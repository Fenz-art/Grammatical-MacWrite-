export type StructuredSegmentKind = "prose" | "fenced-code" | "command" | "table-divider" | "directive" | "html-card" | "comment" | "opaque-card-item";
export type StructuredNodeType = "paragraph" | "heading" | "list-item" | "blockquote" | "table-row" | "table-cell" | "inline-code" | "link-label" | "link-destination" | "emphasis-marker" | "markdown-marker" | "fenced-code" | "code-comment" | "command" | "table-divider" | "directive" | "html-card" | "comment" | "opaque-card-item";

export type StructuredEditableUnit = {
  id: string;
  text: string;
  segmentId: string;
  label: string;
  nodeType: StructuredNodeType;
};

type StaticPart = { kind: "static"; value: string; nodeType: StructuredNodeType };
type EditablePart = { kind: "editable"; unitId: string; nodeType: StructuredNodeType };
type StructuredPart = StaticPart | EditablePart;

export type StructuredSegment = {
  id: string;
  kind: StructuredSegmentKind;
  label: string;
  nodeType: StructuredNodeType;
  parts: StructuredPart[];
};

export type StructuredDocument = {
  source: string;
  segments: StructuredSegment[];
  units: StructuredEditableUnit[];
  immutableLabels: string[];
  hasStructure: boolean;
};

export type StructurePreservation = {
  immutableLabels: string[];
  immutableRegionCount: number;
  preserved: boolean;
};

const FENCE_OPEN = /^\s*(`{3,}|~{3,})[^\n]*$/;
const TABLE_DIVIDER = /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/;
const DIRECTIVE = /^\s*(?:::[:\w-]*|>\s*\[![A-Z]+\])\s*$/;
const HTML_CARD = /^\s*<\/?(?:details|summary|div|table|thead|tbody|tr|td|th|pre|code|script|style)\b[^>]*>\s*$/i;
const COMMENT = /^\s*<!--.*-->\s*$/;
const HORIZONTAL_RULE = /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/;
const COMMAND_LINE = /^\s*(?:[$>#]\s*)?(?:npm|pnpm|yarn|bun|npx|pip(?:3)?|poetry|cargo|go|git|docker|kubectl|curl|wget|node|python(?:3)?)\b/;
const OPAQUE_CARD_ITEM = /^\s*[a-z0-9][a-z0-9._/@-]*-[a-z0-9._/@-]+\s*$/i;
const INLINE_TOKEN = /(`[^`\n]*`|!\[[^\]]*\]\([^\n)]*\)|\[[^\]]*\]\([^\n)]*\)|https?:\/\/[^\s)\]}>,]+|www\.[^\s)\]}>,]+|<[^>\n]+>|\*\*[^*\n]+\*\*|__[^_\n]+__)/g;

function splitLines(text: string) {
  return text.match(/[^\n]*(?:\n|$)/g)?.filter((line, index, lines) => line.length > 0 || index < lines.length - 1) ?? [];
}

function createStatic(value: string, nodeType: StructuredNodeType = "markdown-marker"): StaticPart {
  return { kind: "static", value, nodeType };
}

function addEditable(parts: StructuredPart[], units: StructuredEditableUnit[], segmentId: string, value: string, label: string, nodeType: StructuredNodeType = "paragraph") {
  if (!value) return;
  const id = `editable-${units.length + 1}`;
  units.push({ id, text: value, segmentId, label, nodeType });
  parts.push({ kind: "editable", unitId: id, nodeType });
}

function splitInlineContent(value: string, parts: StructuredPart[], units: StructuredEditableUnit[], segmentId: string, label: string, nodeType: StructuredNodeType = "paragraph") {
  let cursor = 0;
  const matcher = new RegExp(INLINE_TOKEN.source, INLINE_TOKEN.flags);
  let match = matcher.exec(value);
  while (match) {
    addEditable(parts, units, segmentId, value.slice(cursor, match.index), label, nodeType);
    const token = match[0];
    if (token.startsWith("[") && !token.startsWith("![")) {
      const link = /^(\[)([^\]]*)(\]\([^\n)]*\))$/.exec(token);
      if (link) {
        parts.push(createStatic(link[1], "markdown-marker"));
        addEditable(parts, units, segmentId, link[2], "link label", "link-label");
        parts.push(createStatic(link[3], "link-destination"));
      } else parts.push(createStatic(token, "link-destination"));
    } else if ((token.startsWith("**") && token.endsWith("**")) || (token.startsWith("__") && token.endsWith("__"))) {
      const marker = token.slice(0, 2);
      parts.push(createStatic(marker, "emphasis-marker"));
      addEditable(parts, units, segmentId, token.slice(2, -2), "emphasized text", nodeType);
      parts.push(createStatic(marker, "emphasis-marker"));
    } else parts.push(createStatic(token, token.startsWith("`") ? "inline-code" : "link-destination"));
    cursor = match.index + token.length;
    match = matcher.exec(value);
  }
  addEditable(parts, units, segmentId, value.slice(cursor), label, nodeType);
}

function linePrefixAndContent(line: string) {
  const newline = line.endsWith("\n") ? "\n" : "";
  const body = newline ? line.slice(0, -1) : line;
  const prefixMatch = /^(\s*(?:(?:>\s*)+)?(?:#{1,6}\s+|[-*+]\s+(?:\[[ xX]\]\s+)?|\d+[.)]\s+)?)/.exec(body);
  const prefix = prefixMatch?.[1] ?? "";
  let content = body.slice(prefix.length);
  let suffix = newline;
  const closingHeading = /^(.*?)(\s+#+\s*)$/.exec(content);
  if (closingHeading && /^\s*#{1,6}\s/.test(body)) {
    content = closingHeading[1];
    suffix = closingHeading[2] + suffix;
  }
  return { prefix, content, suffix };
}

function tableParts(line: string, parts: StructuredPart[], units: StructuredEditableUnit[], segmentId: string) {
  const newline = line.endsWith("\n") ? "\n" : "";
  const body = newline ? line.slice(0, -1) : line;
  const cells = body.split("|");
  for (let index = 0; index < cells.length; index += 1) {
    if (index > 0) parts.push(createStatic("|", "table-divider"));
    const cell = cells[index];
    const leading = cell.match(/^\s*/)?.[0] ?? "";
    const trailing = cell.match(/\s*$/)?.[0] ?? "";
    parts.push(createStatic(leading, "table-divider"));
    splitInlineContent(cell.slice(leading.length, cell.length - trailing.length), parts, units, segmentId, "table cell", "table-cell");
    parts.push(createStatic(trailing, "table-divider"));
  }
  parts.push(createStatic(newline, "table-divider"));
}

function codeCommentParts(line: string) {
  const newline = line.endsWith("\n") ? "\n" : "";
  const body = newline ? line.slice(0, -1) : line;
  const match = /^(\s*(?:\/\/+|#|--|;|\*)\s?)(.*)$/.exec(body);
  if (!match) return null;
  return { prefix: match[1], comment: match[2], suffix: newline };
}

export function parseStructuredDocument(text: string, options: { transformCodeComments?: boolean } = {}): StructuredDocument {
  const units: StructuredEditableUnit[] = [];
  const segments: StructuredSegment[] = [];
  const immutableLabels: string[] = [];
  const lines = splitLines(text);
  let fence: { marker: string; segmentId: string; parts: StructuredPart[] } | null = null;
  const pushStatic = (kind: StructuredSegmentKind, label: string, value: string) => {
    segments.push({ id: `segment-${segments.length + 1}`, kind, label, nodeType: kind as StructuredNodeType, parts: [createStatic(value, kind as StructuredNodeType)] });
    immutableLabels.push(label);
  };
  const closeFence = () => {
    if (!fence) return;
    segments.push({ id: fence.segmentId, kind: "fenced-code", label: "fenced code block", nodeType: "fenced-code", parts: fence.parts });
    immutableLabels.push("fenced code block");
    fence = null;
  };

  for (const line of lines) {
    if (fence) {
      const close = FENCE_OPEN.exec(line.replace(/\n$/, ""));
      if (close && close[1][0] === fence.marker[0] && close[1].length >= fence.marker.length) {
        fence.parts.push(createStatic(line, "fenced-code"));
        closeFence();
      } else {
        const comment = options.transformCodeComments ? codeCommentParts(line) : null;
        if (comment && comment.comment.trim()) {
          fence.parts.push(createStatic(comment.prefix, "code-comment"));
          addEditable(fence.parts, units, fence.segmentId, comment.comment, "code comment", "code-comment");
          fence.parts.push(createStatic(comment.suffix, "code-comment"));
        } else fence.parts.push(createStatic(line, "fenced-code"));
      }
      continue;
    }
    const opening = FENCE_OPEN.exec(line.replace(/\n$/, ""));
    if (opening) {
      const segmentId = `segment-${segments.length + 1}`;
      fence = { marker: opening[1], segmentId, parts: [createStatic(line, "fenced-code")] };
      continue;
    }
    if (TABLE_DIVIDER.test(line) || HORIZONTAL_RULE.test(line)) {
      pushStatic("table-divider", TABLE_DIVIDER.test(line) ? "Markdown table divider" : "Markdown divider", line);
      continue;
    }
    if (DIRECTIVE.test(line)) {
      pushStatic("directive", "Markdown directive", line);
      continue;
    }
    if (HTML_CARD.test(line)) {
      pushStatic("html-card", "rich card framing", line);
      continue;
    }
    if (COMMENT.test(line)) {
      pushStatic("comment", "Markdown comment", line);
      continue;
    }
    if (COMMAND_LINE.test(line)) {
      pushStatic("command", "runnable command", line);
      continue;
    }
    if (OPAQUE_CARD_ITEM.test(line)) {
      pushStatic("opaque-card-item", "technical card item", line);
      continue;
    }
    const segmentId = `segment-${segments.length + 1}`;
    const parts: StructuredPart[] = [];
    const isTableRow = /^\s*\|/.test(line) && /\|/.test(line.slice(line.indexOf("|") + 1));
    if (isTableRow) tableParts(line, parts, units, segmentId);
    else {
      const { prefix, content, suffix } = linePrefixAndContent(line);
      const nodeType: StructuredNodeType = /^\s*#{1,6}\s+/.test(line) ? "heading" : /^\s*(?:(?:>\s*)+)/.test(line) ? "blockquote" : /^\s*(?:[-*+]\s+|\d+[.)]\s+)/.test(line) ? "list-item" : "paragraph";
      parts.push(createStatic(prefix, "markdown-marker"));
      splitInlineContent(content, parts, units, segmentId, nodeType === "heading" ? "heading text" : nodeType === "list-item" ? "list item" : nodeType === "blockquote" ? "block quote" : "Markdown prose", nodeType);
      parts.push(createStatic(suffix, "markdown-marker"));
    }
    segments.push({ id: segmentId, kind: "prose", label: isTableRow ? "Markdown table row" : "Markdown prose", nodeType: isTableRow ? "table-row" : (/^\s*#{1,6}\s+/.test(line) ? "heading" : /^\s*(?:(?:>\s*)+)/.test(line) ? "blockquote" : /^\s*(?:[-*+]\s+|\d+[.)]\s+)/.test(line) ? "list-item" : "paragraph"), parts });
  }
  closeFence();
  return { source: text, segments, units, immutableLabels, hasStructure: immutableLabels.length > 0 || /(^|\n)\s*(?:#{1,6}\s+|[-*+]\s+|\d+[.)]\s+|\|)/m.test(text) || /`[^`]+`|\[[^\]]+\]\([^\n)]+\)/.test(text) };
}

export function reconstructStructuredDocument(document: StructuredDocument, transformed: Record<string, string>) {
  return document.segments.map(segment => segment.parts.map(part => part.kind === "static" ? part.value : transformed[part.unitId] ?? document.units.find(unit => unit.id === part.unitId)?.text ?? "").join("")).join("");
}

export function normalizeEditableCandidate(source: string, candidate: string) {
  const leading = source.match(/^\s*/)?.[0] ?? "";
  const trailing = source.match(/\s*$/)?.[0] ?? "";
  const core = candidate.trim();
  if (!core || (!source.includes("\n") && /[\n`{}<>]/.test(core))) return source;
  return `${leading}${core}${trailing}`;
}

export function assessStructurePreservation(original: string, candidate: string, options: { transformCodeComments?: boolean } = {}): StructurePreservation {
  const document = parseStructuredDocument(original, options);
  const immutableValues = document.segments
    .filter(segment => segment.kind !== "prose")
    .flatMap(segment => segment.parts.filter((part): part is StaticPart => part.kind === "static").map(part => part.value))
    .filter(Boolean);
  let cursor = 0;
  const preserved = immutableValues.every(value => {
    const index = candidate.indexOf(value, cursor);
    if (index < 0) return false;
    cursor = index + value.length;
    return true;
  });
  return { immutableLabels: document.immutableLabels, immutableRegionCount: immutableValues.length, preserved };
}
