import { Code2, Columns2, Eye, FileText } from "lucide-react";
import { type ReactNode } from "react";
import { createMarkdownPreviewState } from "@shared/markdownPreview";
import "./MarkdownPreviewPanel.css";

type MarkdownPreviewPanelProps = {
  markdown: string;
};

const fence = /^\s*(`{3,}|~{3,})\s*([^\s]*)/;
const heading = /^(#{1,6})\s+(.+)$/;
const bullet = /^\s*[-*+]\s+(.+)$/;
const ordered = /^\s*\d+[.)]\s+(.+)$/;
const quote = /^\s*>\s?(.*)$/;
const tableRow = /^\s*\|.*\|\s*$/;
const tableDivider = /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/;
const inlineToken = /(`[^`]+`|\[[^\]]+\]\([^\s)]+\)|\*\*[^*]+\*\*)/g;

function renderInline(value: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let cursor = 0;
  let tokenIndex = 0;
  const matcher = new RegExp(inlineToken.source, inlineToken.flags);
  let match = matcher.exec(value);
  while (match) {
    if (match.index > cursor) nodes.push(value.slice(cursor, match.index));
    const token = match[0];
    const key = `${keyPrefix}-${tokenIndex++}`;
    if (token.startsWith("`")) nodes.push(<code key={key}>{token.slice(1, -1)}</code>);
    else if (token.startsWith("**")) nodes.push(<strong key={key}>{token.slice(2, -2)}</strong>);
    else {
      const link = /^\[([^\]]+)\]\(([^\s)]+)\)$/.exec(token);
      if (link && /^(https?:\/\/|mailto:)/i.test(link[2])) nodes.push(<a key={key} href={link[2]} target="_blank" rel="noreferrer">{link[1]}</a>);
      else nodes.push(token);
    }
    cursor = match.index + token.length;
    match = matcher.exec(value);
  }
  if (cursor < value.length) nodes.push(value.slice(cursor));
  return nodes;
}

function cells(line: string) {
  return line.trim().replace(/^\||\|$/g, "").split("|").map(cell => cell.trim());
}

function renderMarkdown(markdown: string) {
  const lines = markdown.split("\n");
  const blocks: ReactNode[] = [];
  let index = 0;
  let blockId = 0;
  const nextKey = () => `block-${blockId++}`;
  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) { index += 1; continue; }
    const opening = fence.exec(line);
    if (opening) {
      const language = opening[2] || "text";
      const code: string[] = [];
      index += 1;
      while (index < lines.length && !new RegExp(`^\\s*${opening[1][0]}{${opening[1].length},}\\s*$`).test(lines[index])) code.push(lines[index++]);
      if (index < lines.length) index += 1;
      blocks.push(<div className="markdown-code-card" key={nextKey()}><span>{language}</span><pre><code>{code.join("\n")}</code></pre></div>);
      continue;
    }
    const headingMatch = heading.exec(line);
    if (headingMatch) {
      const level = Math.min(4, headingMatch[1].length);
      const Tag = `h${level}` as "h1" | "h2" | "h3" | "h4";
      blocks.push(<Tag key={nextKey()}>{renderInline(headingMatch[2], `heading-${blockId}`)}</Tag>);
      index += 1;
      continue;
    }
    if (tableRow.test(line)) {
      const rows: string[][] = [];
      while (index < lines.length && tableRow.test(lines[index])) {
        if (!tableDivider.test(lines[index])) rows.push(cells(lines[index]));
        index += 1;
      }
      const [headerRow, ...bodyRows] = rows;
      blocks.push(<table key={nextKey()}><thead><tr>{(headerRow ?? []).map((cell, cellIndex) => <th key={cellIndex}>{renderInline(cell, `header-${cellIndex}`)}</th>)}</tr></thead><tbody>{bodyRows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, cellIndex) => <td key={cellIndex}>{renderInline(cell, `cell-${rowIndex}-${cellIndex}`)}</td>)}</tr>)}</tbody></table>);
      continue;
    }
    const list = bullet.exec(line) ?? ordered.exec(line);
    if (list) {
      const orderedList = Boolean(ordered.exec(line));
      const values: string[] = [];
      while (index < lines.length) {
        const item = orderedList ? ordered.exec(lines[index]) : bullet.exec(lines[index]);
        if (!item) break;
        values.push(item[1]);
        index += 1;
      }
      const List = orderedList ? "ol" : "ul";
      blocks.push(<List key={nextKey()}>{values.map((value, valueIndex) => <li key={valueIndex}>{renderInline(value, `list-${valueIndex}`)}</li>)}</List>);
      continue;
    }
    const quoteMatch = quote.exec(line);
    if (quoteMatch) {
      const quotes: string[] = [];
      while (index < lines.length) {
        const next = quote.exec(lines[index]);
        if (!next) break;
        quotes.push(next[1]);
        index += 1;
      }
      blocks.push(<blockquote key={nextKey()}>{quotes.map((value, quoteIndex) => <p key={quoteIndex}>{renderInline(value, `quote-${quoteIndex}`)}</p>)}</blockquote>);
      continue;
    }
    const paragraph: string[] = [];
    while (index < lines.length && lines[index].trim() && !fence.test(lines[index]) && !heading.test(lines[index]) && !tableRow.test(lines[index]) && !bullet.test(lines[index]) && !ordered.test(lines[index]) && !quote.test(lines[index])) paragraph.push(lines[index++]);
    blocks.push(<p key={nextKey()}>{renderInline(paragraph.join(" "), `paragraph-${blockId}`)}</p>);
  }
  return blocks;
}

export function MarkdownPreviewPanel({ markdown }: MarkdownPreviewPanelProps) {
  const preview = createMarkdownPreviewState(markdown);
  if (!preview.hasStructure) return null;
  const immutable = preview.protectedRegions;
  return <details className="markdown-preview-panel" open>
    <summary><span><Columns2 size={14} /> Markdown preview</span><small><Code2 size={12} /> {preview.protectedRegionCount ? `${preview.protectedRegionCount} protected region${preview.protectedRegionCount === 1 ? "" : "s"}` : "Structured source"}</small></summary>
    <div className="markdown-preview-grid">
      <section className="markdown-source-pane" aria-label="Raw Markdown source"><header><FileText size={13} /> Raw source</header><pre>{markdown}</pre></section>
      <section className="markdown-render-pane" aria-label="Rendered Markdown preview"><header><Eye size={13} /> Rendered preview</header><article>{renderMarkdown(markdown)}</article></section>
    </div>
    {immutable.length ? <div className="markdown-preview-footnote">Protected: {immutable.join(" · ")}. Preview is derived from the same source shown at left.</div> : null}
  </details>;
}
