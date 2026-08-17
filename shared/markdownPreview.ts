import { parseStructuredDocument } from "./structuredDocument";

export type MarkdownPreviewBlockKind = "heading" | "paragraph" | "list" | "blockquote" | "table" | "fenced-code";
export type MarkdownPreviewInlineKind = "link" | "inline-code" | "emphasis";

export type MarkdownPreviewBlock = {
  kind: MarkdownPreviewBlockKind;
  startLine: number;
  endLine: number;
  language?: string;
  inlineKinds: MarkdownPreviewInlineKind[];
};

export type MarkdownPreviewState = {
  rawSource: string;
  blocks: MarkdownPreviewBlock[];
  protectedRegions: string[];
  protectedRegionCount: number;
  hasStructure: boolean;
};

const FENCE = /^\s*(`{3,}|~{3,})\s*([^\s]*)/;
const HEADING = /^#{1,6}\s+/;
const LIST = /^\s*(?:[-*+]\s+|\d+[.)]\s+)/;
const QUOTE = /^\s*>\s?/;
const TABLE_ROW = /^\s*\|.*\|\s*$/;
const LINK = /\[[^\]]+\]\([^\s)]+\)/;
const INLINE_CODE = /`[^`]+`/;
const EMPHASIS = /(?:\*\*[^*]+\*\*|__[^_]+__)/;

function inlineKinds(value: string): MarkdownPreviewInlineKind[] {
  const kinds: MarkdownPreviewInlineKind[] = [];
  if (LINK.test(value)) kinds.push("link");
  if (INLINE_CODE.test(value)) kinds.push("inline-code");
  if (EMPHASIS.test(value)) kinds.push("emphasis");
  return kinds;
}

export function createMarkdownPreviewState(rawSource: string): MarkdownPreviewState {
  const document = parseStructuredDocument(rawSource);
  const blocks: MarkdownPreviewBlock[] = [];
  const lines = rawSource.split("\n");
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) { index += 1; continue; }
    const opening = FENCE.exec(line);
    if (opening) {
      const start = index;
      index += 1;
      while (index < lines.length && !new RegExp(`^\\s*${opening[1][0]}{${opening[1].length},}\\s*$`).test(lines[index])) index += 1;
      if (index < lines.length) index += 1;
      blocks.push({ kind: "fenced-code", startLine: start + 1, endLine: index, language: opening[2] || "text", inlineKinds: [] });
      continue;
    }
    if (HEADING.test(line)) { blocks.push({ kind: "heading", startLine: index + 1, endLine: index + 1, inlineKinds: inlineKinds(line) }); index += 1; continue; }
    if (TABLE_ROW.test(line)) {
      const start = index;
      while (index < lines.length && TABLE_ROW.test(lines[index])) index += 1;
      blocks.push({ kind: "table", startLine: start + 1, endLine: index, inlineKinds: inlineKinds(lines.slice(start, index).join("\n")) });
      continue;
    }
    if (LIST.test(line)) {
      const start = index;
      while (index < lines.length && LIST.test(lines[index])) index += 1;
      blocks.push({ kind: "list", startLine: start + 1, endLine: index, inlineKinds: inlineKinds(lines.slice(start, index).join("\n")) });
      continue;
    }
    if (QUOTE.test(line)) {
      const start = index;
      while (index < lines.length && QUOTE.test(lines[index])) index += 1;
      blocks.push({ kind: "blockquote", startLine: start + 1, endLine: index, inlineKinds: inlineKinds(lines.slice(start, index).join("\n")) });
      continue;
    }
    const start = index;
    while (index < lines.length && lines[index].trim() && !FENCE.test(lines[index]) && !HEADING.test(lines[index]) && !TABLE_ROW.test(lines[index]) && !LIST.test(lines[index]) && !QUOTE.test(lines[index])) index += 1;
    blocks.push({ kind: "paragraph", startLine: start + 1, endLine: index, inlineKinds: inlineKinds(lines.slice(start, index).join("\n")) });
  }
  const protectedRegions = document.immutableLabels.filter((value, position, values) => values.indexOf(value) === position);
  return { rawSource, blocks, protectedRegions, protectedRegionCount: protectedRegions.length, hasStructure: document.hasStructure };
}
