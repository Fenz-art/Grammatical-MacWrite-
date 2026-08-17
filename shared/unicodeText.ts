export type UnicodeSpecialKind = "emoji" | "unicode-symbol" | "unicode-punctuation" | "ascii-special";

const nonAsciiPattern = new RegExp("[^\\p{ASCII}]", "u");
const pictographicPattern = new RegExp("\\p{Extended_Pictographic}", "u");
const punctuationPattern = new RegExp("\\p{Punctuation}", "u");
const symbolPattern = new RegExp("\\p{Symbol}", "u");

const segmenter = typeof Intl !== "undefined" && "Segmenter" in Intl
  ? new Intl.Segmenter(undefined, { granularity: "grapheme" })
  : null;

export function graphemes(text: string): string[] {
  if (segmenter) return Array.from(segmenter.segment(text), part => part.segment);
  return Array.from(text);
}

export function graphemeLength(text: string): number {
  return graphemes(text).length;
}

export function safePrefixByGrapheme(text: string, maxCodeUnits: number): string {
  if (text.length <= maxCodeUnits) return text;
  let used = 0;
  let result = "";
  for (const grapheme of graphemes(text)) {
    if (used + grapheme.length > maxCodeUnits) break;
    result += grapheme;
    used += grapheme.length;
  }
  return result;
}

export function isUnicodeSpecialGrapheme(grapheme: string): boolean {
  return nonAsciiPattern.test(grapheme) || symbolPattern.test(grapheme) || punctuationPattern.test(grapheme);
}

export function classifyUnicodeSpecial(grapheme: string): UnicodeSpecialKind | null {
  if (!isUnicodeSpecialGrapheme(grapheme)) return null;
  if (pictographicPattern.test(grapheme)) return "emoji";
  if (nonAsciiPattern.test(grapheme) && punctuationPattern.test(grapheme)) return "unicode-punctuation";
  if (nonAsciiPattern.test(grapheme) && symbolPattern.test(grapheme)) return "unicode-symbol";
  if (nonAsciiPattern.test(grapheme)) return "unicode-symbol";
  return "ascii-special";
}

export function meaningfulUnicodeSpecials(text: string): string[] {
  const values: string[] = [];
  let asciiRun = "";
  const flushAsciiRun = () => {
    if (asciiRun.length >= 2 && /[^\w\s]/.test(asciiRun)) values.push(asciiRun);
    asciiRun = "";
  };
  for (const grapheme of graphemes(text)) {
    const kind = classifyUnicodeSpecial(grapheme);
    if (kind === "ascii-special") {
      asciiRun += grapheme;
      continue;
    }
    flushAsciiRun();
    if (kind) values.push(grapheme);
  }
  flushAsciiRun();
  return Array.from(new Set(values));
}

export function boundaryWhitespace(text: string): string[] {
  const values: string[] = [];
  const leading = text.match(/^\s+/)?.[0];
  const trailing = text.match(/\s+$/)?.[0];
  if (leading) values.push(leading);
  if (trailing && trailing !== leading) values.push(trailing);
  const blankLines = text.match(/(?:\r?\n[ \t]*){2,}/g) ?? [];
  values.push(...blankLines);
  return values;
}

export function meaningfulWhitespaceRuns(text: string): string[] {
  return (text.match(/\s+/g) ?? []).filter(run => run.length > 1 || /[\t\r\n]/.test(run));
}

export function preservesMeaningfulWhitespace(original: string, candidate: string): boolean {
  const expected = meaningfulWhitespaceRuns(original);
  const actual = meaningfulWhitespaceRuns(candidate);
  return expected.every((run, index) => actual[index] === run);
}

export function preservesBoundaryWhitespace(original: string, candidate: string): boolean {
  const leading = original.match(/^\s+/)?.[0] ?? "";
  const trailing = original.match(/\s+$/)?.[0] ?? "";
  if (leading && !candidate.startsWith(leading)) return false;
  if (trailing && !candidate.endsWith(trailing)) return false;
  const originalBlankLines = original.match(/(?:\r?\n[ \t]*){2,}/g) ?? [];
  const candidateBlankLines = candidate.match(/(?:\r?\n[ \t]*){2,}/g) ?? [];
  return originalBlankLines.every((value, index) => candidateBlankLines[index] === value);
}

export function normalizeLineEndingsPreservingText(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}
