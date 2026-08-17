import { graphemeLength, normalizeLineEndingsPreservingText, safePrefixByGrapheme } from "./unicodeText";

// Keep each semantic request below the provider context/output pressure point while retaining readable CLI wrappers.
// Small enough for predictable completion latency while still preserving useful CLI-sized paste wrappers.
export const MAX_TRANSFORM_BLOCK_CHARS = 3_200;

export type PasteBlock = {
  id: string;
  index: number;
  text: string;
  charCount: number;
  lineCount: number;
  preview: string;
};

function lastBoundaryAfter(window: string, pattern: RegExp, minimum: number) {
  let boundary = -1;
  for (const match of Array.from(window.matchAll(pattern))) {
    const index = (match.index ?? 0) + match[0].length;
    if (index >= minimum) boundary = index;
  }
  return boundary;
}

function splitAtSafeBoundary(text: string, maxChars: number): string[] {
  const blocks: string[] = [];
  let rest = text;
  const minimum = Math.floor(maxChars * 0.55);
  while (rest.length > maxChars) {
    const window = safePrefixByGrapheme(rest, maxChars);
    const lineBoundary = window.lastIndexOf("\n") + 1;
    const sentenceBoundary = lastBoundaryAfter(window, /[.!?](?:[\\"'”’»)]*)?(?=\s|$)/g, minimum);
    const wordBoundary = window.lastIndexOf(" ") + 1;
    const boundary = lineBoundary > minimum
      ? lineBoundary
      : sentenceBoundary > minimum
        ? sentenceBoundary
        : wordBoundary > minimum
          ? wordBoundary
          : window.length;
    blocks.push(rest.slice(0, boundary));
    rest = rest.slice(boundary);
  }
  if (rest.length) blocks.push(rest);
  return blocks;
}

function paragraphSegments(text: string) {
  const segments: string[] = [];
  const separator = /\n{2,}/g;
  let start = 0;
  for (const match of Array.from(text.matchAll(separator))) {
    const end = (match.index ?? 0) + match[0].length;
    segments.push(text.slice(start, end));
    start = end;
  }
  if (start < text.length) segments.push(text.slice(start));
  return segments.length ? segments : [text];
}

export function splitPasteBlocks(text: string, maxChars = MAX_TRANSFORM_BLOCK_CHARS): PasteBlock[] {
  const normalized = normalizeLineEndingsPreservingText(text);
  const sourceParts = paragraphSegments(normalized);
  const grouped: string[] = [];
  let current = "";
  for (const paragraph of sourceParts) {
    const candidate = current + paragraph;
    if (current && candidate.length > maxChars) {
      grouped.push(current);
      current = paragraph;
    } else {
      current = candidate;
    }
  }
  if (current) grouped.push(current);
  const chunks = grouped.flatMap(part => splitAtSafeBoundary(part, maxChars));
  return chunks.map((part, index) => ({
    id: crypto.randomUUID(),
    index,
    text: part,
    charCount: graphemeLength(part),
    lineCount: part.split("\n").length,
    preview: part.replace(/\s+/g, " ").trim().slice(0, 96) + (part.replace(/\s+/g, " ").trim().length > 96 ? "…" : ""),
  }));
}

export function pasteWrapperLabel(block: Pick<PasteBlock, "index" | "charCount" | "lineCount">) {
  return `[Pasted text #${block.index + 1} · ${block.charCount.toLocaleString()} chars · ${block.lineCount.toLocaleString()} lines]`;
}

export function outputFilename(index: number) {
  return `output${index + 1}.txt`;
}

export function downloadTextFile(filename: string, text: string) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function buildDownloadAllText(outputs: Array<{ index: number; text: string }>) {
  return outputs
    .sort((a, b) => a.index - b.index)
    .map(output => `===== ${outputFilename(output.index)} =====\n\n${output.text.trim()}\n`)
    .join("\n");
}
