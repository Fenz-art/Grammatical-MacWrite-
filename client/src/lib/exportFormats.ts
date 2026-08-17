import { Document, HeadingLevel, Packer, Paragraph, TextRun } from "docx";
import { plainTextFromRichHtml } from "@shared/richText";
import type { PassageSemanticContext } from "@shared/semanticContext";
import { createProtectedTermGlossary, reviewedText, type DocumentReview, type SemanticRisk, type WritingProfileId } from "@shared/documentReview";

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;");
}

function filenameBase(title: string) {
  return title.trim().replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase().slice(0, 64) || "grammatical-output";
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function textToMarkdown(text: string) {
  return text.split(/\n{2,}/).map(paragraph => paragraph.split("\n").join("  \n")).join("\n\n").trim() + "\n";
}

function richHtmlToMarkdown(html: string) {
  if (typeof DOMParser === "undefined") return textToMarkdown(plainTextFromRichHtml(html));
  const root = new DOMParser().parseFromString(`<div>${html}</div>`, "text/html").body.firstElementChild;
  if (!root) return "\n";
  const render = (node: Node, context: { bold?: boolean; italic?: boolean; underline?: boolean } = {}): string => {
    if (node.nodeType === Node.TEXT_NODE) {
      let value = node.textContent ?? "";
      if (context.bold) value = `**${value}**`;
      if (context.italic) value = `*${value}*`;
      if (context.underline) value = `<u>${value}</u>`;
      return value;
    }
    if (!(node instanceof HTMLElement)) return Array.from(node.childNodes).map(child => render(child, context)).join("");
    const next = {
      bold: context.bold || node.tagName === "STRONG" || node.tagName === "B",
      italic: context.italic || node.tagName === "EM" || node.tagName === "I",
      underline: context.underline || node.tagName === "U",
    };
    const inner = Array.from(node.childNodes).map(child => render(child, next)).join("");
    return ["DIV", "P", "BR"].includes(node.tagName) ? `${inner}\n\n` : inner;
  };
  return textToMarkdown(render(root).replace(/\n{3,}/g, "\n\n"));
}

function runsForNode(node: Node, context: { bold?: boolean; italics?: boolean; underline?: boolean } = {}): TextRun[] {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent ? [new TextRun({ text: node.textContent, bold: context.bold, italics: context.italics, underline: context.underline ? {} : undefined })] : [];
  }
  if (node instanceof HTMLElement && node.tagName === "BR") return [new TextRun({ break: 1 })];
  const element = node instanceof HTMLElement ? node : null;
  const next = {
    bold: context.bold || element?.tagName === "STRONG" || element?.tagName === "B",
    italics: context.italics || element?.tagName === "EM" || element?.tagName === "I",
    underline: context.underline || element?.tagName === "U",
  };
  return Array.from(node.childNodes).flatMap(child => runsForNode(child, next));
}

function richHtmlToDocxParagraphs(html: string) {
  if (typeof DOMParser === "undefined") return [new Paragraph({ children: [new TextRun(plainTextFromRichHtml(html))] })];
  const root = new DOMParser().parseFromString(`<div>${html}</div>`, "text/html").body.firstElementChild;
  if (!root) return [new Paragraph({ children: [new TextRun(plainTextFromRichHtml(html))] })];
  const paragraphs: Paragraph[] = [];
  const blockNodes = Array.from(root.childNodes).filter(node => node instanceof HTMLElement && ["P", "DIV", "LI", "H1", "H2", "H3"].includes(node.tagName));
  if (blockNodes.length) {
    blockNodes.forEach(node => paragraphs.push(new Paragraph({ children: runsForNode(node) })));
    return paragraphs;
  }
  const plainBlocks = plainTextFromRichHtml(html).split(/\n{2,}/);
  return plainBlocks.map(block => new Paragraph({ children: [new TextRun(block)] }));
}

export async function downloadRichFormats(html: string, title: string) {
  const base = filenameBase(title);
  const markdown = richHtmlToMarkdown(html);
  const standaloneHtml = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>body{font:16px/1.6 system-ui,sans-serif;max-width:760px;margin:40px auto;padding:0 24px;color:#182233}h1{font-size:24px;margin-bottom:24px}p{margin:0 0 16px}mark{background:#fff0a6}</style></head><body><h1>${escapeHtml(title)}</h1><article>${html}</article></body></html>`;
  triggerDownload(new Blob([markdown], { type: "text/markdown;charset=utf-8" }), `${base}.md`);
  triggerDownload(new Blob([standaloneHtml], { type: "text/html;charset=utf-8" }), `${base}.html`);
  const doc = new Document({ sections: [{ children: [new Paragraph({ text: title, heading: HeadingLevel.TITLE }), ...richHtmlToDocxParagraphs(html)] }] });
  const docxBlob = await Packer.toBlob(doc);
  triggerDownload(docxBlob, `${base}.docx`);
  return { markdown, filenames: [`${base}.md`, `${base}.html`, `${base}.docx`] };
}

export function richHtmlToMarkdownText(html: string) {
  return richHtmlToMarkdown(html);
}

export function semanticAnalysisToMarkdown(context: PassageSemanticContext, title: string) {
  const lines = [
    `# Semantic analysis — ${title}`,
    "",
    `- **Sentences analyzed:** ${context.sentenceCount}`,
    `- **Entities inferred:** ${context.entities.length}`,
    "",
    "## Entities",
    "",
  ];
  if (!context.entities.length) lines.push("No named or technical entities were confidently inferred.");
  for (const entity of context.entities) {
    lines.push(`### ${entity.name}`, "", `- **Type:** ${entity.type}`, `- **Confidence:** ${Math.round(entity.confidence * 100)}%`, `- **Roles:** ${entity.roles.length ? entity.roles.join(", ") : "None inferred"}`, `- **Evidence:** ${entity.evidence.length ? entity.evidence.join(" · ") : "None captured"}`, "");
  }
  lines.push("## Context relations", "");
  lines.push(...(context.relations.length ? context.relations.map(relation => `- ${relation}`) : ["No explicit relations inferred."]));
  return `${lines.join("\n").trim()}\n`;
}

export type SemanticAnalysisExportFormat = "json" | "markdown";

export function downloadSemanticAnalysis(context: PassageSemanticContext, title: string, format: SemanticAnalysisExportFormat) {
  const base = `${filenameBase(title)}-semantic-analysis`;
  const markdown = semanticAnalysisToMarkdown(context, title);
  const json = JSON.stringify({ title, generatedAt: new Date().toISOString(), analysis: context }, null, 2);
  if (format === "json") {
    const filename = `${base}.json`;
    triggerDownload(new Blob([json], { type: "application/json;charset=utf-8" }), filename);
    return { markdown, json, filename };
  }
  const filename = `${base}.md`;
  triggerDownload(new Blob([markdown], { type: "text/markdown;charset=utf-8" }), filename);
  return { markdown, json, filename };
}

export type ChangeReportExportFormat = "json" | "markdown";

export function changeReportToMarkdown({ title, review, risks, profileLabel }: { title: string; review: DocumentReview; risks: SemanticRisk[]; profileLabel: string }) {
  const finalText = reviewedText(review);
  const changes = review.segments.filter(segment => segment.kind !== "unchanged");
  const accepted = changes.filter(segment => segment.accepted).length;
  const rejected = changes.length - accepted;
  const lines = [
    `# Change report — ${title}`,
    "",
    `- **Writing profile:** ${profileLabel}`,
    `- **Final review status:** ${review.finalizedAt ? "Finalized selective review" : review.stale ? "Manual edits after diff snapshot" : "Selective review not finalized"}`,
    `- **Finalized at:** ${review.finalizedAt ?? "Not finalized"}`,
    `- **Applied transformations:** ${accepted}`,
    `- **Rejected transformations:** ${rejected}`,
    "",
    "## Final document",
    "",
    finalText || "No final document text.",
    "",
    "## Proposed changes",
    "",
  ];
  if (!changes.length) lines.push("No textual changes were proposed.");
  changes.forEach((change, index) => {
    lines.push(`### Change ${index + 1} — ${change.accepted ? "accepted" : "reverted"}`, "", `- **Source:** ${change.source || "—"}`, `- **Proposal:** ${change.proposed || "—"}`, "");
  });
  lines.push("## Semantic safety evidence", "");
  if (!risks.length) lines.push("No additional semantic-risk evidence was recorded.");
  for (const risk of risks) lines.push(`- **${risk.title}:** ${risk.explanation}${risk.protectedValues.length ? ` Protected values: ${risk.protectedValues.join(" · ")}.` : ""}`);
  return `${lines.join("\n").trim()}\n`;
}

export function downloadChangeReport({ title, review, risks, profileLabel, format }: { title: string; review: DocumentReview; risks: SemanticRisk[]; profileLabel: string; format: ChangeReportExportFormat }) {
  const base = `${filenameBase(title)}-change-report`;
  const finalText = reviewedText(review);
  const markdown = changeReportToMarkdown({ title, review, risks, profileLabel });
  const changes = review.segments.filter(segment => segment.kind !== "unchanged");
  const json = JSON.stringify({ title, generatedAt: new Date().toISOString(), profileLabel, finalization: { finalizedAt: review.finalizedAt ?? null, stale: Boolean(review.stale), appliedTransformations: changes.filter(segment => segment.accepted).length, rejectedTransformations: changes.filter(segment => !segment.accepted).length }, sourceText: review.sourceText, proposedText: review.proposedText, finalText, review, semanticRisks: risks }, null, 2);
  const filename = format === "json" ? `${base}.json` : `${base}.md`;
  triggerDownload(new Blob([format === "json" ? json : markdown], { type: format === "json" ? "application/json;charset=utf-8" : "text/markdown;charset=utf-8" }), filename);
  return { markdown, json, filename };
}

export function downloadProtectedTermGlossary(profileId: WritingProfileId, protectedTerms: string[]) {
  const glossary = createProtectedTermGlossary(profileId, protectedTerms);
  const filename = `grammatical-${profileId}-glossary.json`;
  const json = JSON.stringify(glossary, null, 2);
  triggerDownload(new Blob([json], { type: "application/json;charset=utf-8" }), filename);
  return { glossary, json, filename };
}
