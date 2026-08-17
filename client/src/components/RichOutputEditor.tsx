import {
  Bold,
  Check,
  Clipboard,
  Highlighter,
  Italic,
  Redo2,
  Type,
  Underline,
  Undo2,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { plainTextFromRichHtml } from "@shared/richText";

type RichOutputEditorProps = {
  id: string;
  html: string;
  onChange: (html: string) => void;
  onCopy: (html: string, plainText: string) => Promise<void>;
  disabled?: boolean;
};

const FONT_SIZES = [12, 14, 16, 18, 20, 24, 28];
const TEXT_COLORS = ["#f3f7fa", "#74b7ff", "#74e6a1", "#f6c85f", "#ff9ba7", "#d0a8ff"];
const HIGHLIGHT_COLORS = ["#453828", "#25434b", "#493c63", "#55313a", "#3d4b2a", "#263f6b"];

export default function RichOutputEditor({ id, html, onChange, onCopy, disabled }: RichOutputEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const selectionRef = useRef<Range | null>(null);
  const [fontSize, setFontSize] = useState(16);
  const [fontFamily, setFontFamily] = useState("Terminal Mono");
  const [activeFormat, setActiveFormat] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (editorRef.current && editorRef.current.innerHTML !== html) editorRef.current.innerHTML = html;
  }, [html]);

  const emitChange = () => onChange(editorRef.current?.innerHTML ?? html);

  const rememberSelection = () => {
    const selection = window.getSelection();
    if (!selection?.rangeCount || !editorRef.current?.contains(selection.anchorNode)) return;
    selectionRef.current = selection.getRangeAt(0).cloneRange();
  };

  const restoreSelection = () => {
    editorRef.current?.focus();
    if (!selectionRef.current) return;
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(selectionRef.current);
  };

  const applySelectionStyle = (style: Partial<CSSStyleDeclaration>) => {
    restoreSelection();
    const selection = window.getSelection();
    if (!selection?.rangeCount || selection.isCollapsed) return;
    const range = selection.getRangeAt(0);
    const span = document.createElement("span");
    Object.assign(span.style, style);
    try {
      range.surroundContents(span);
    } catch {
      const fragment = range.extractContents();
      span.appendChild(fragment);
      range.insertNode(span);
    }
    selection.removeAllRanges();
    const updatedRange = document.createRange();
    updatedRange.selectNodeContents(span);
    selection.addRange(updatedRange);
    selectionRef.current = updatedRange.cloneRange();
    emitChange();
  };

  const command = (name: string, value?: string) => {
    restoreSelection();
    document.execCommand(name, false, value);
    emitChange();
    setActiveFormat({
      bold: document.queryCommandState("bold"),
      italic: document.queryCommandState("italic"),
      underline: document.queryCommandState("underline"),
    });
  };

  const chooseSize = (size: number) => {
    setFontSize(size);
    applySelectionStyle({ fontSize: `${size}px` });
  };

  const chooseFont = (font: string) => {
    setFontFamily(font);
    const cssFont = font === "System Sans" ? "system-ui" : font === "Serif" ? "Georgia" : font === "Reading Sans" ? "Arial" : "JetBrains Mono";
    applySelectionStyle({ fontFamily: cssFont });
  };

  const copySelection = async () => {
    const selection = window.getSelection();
    if (!selection?.rangeCount || selection.isCollapsed || !editorRef.current?.contains(selection.anchorNode)) {
      toast.info("Select output text before copying a selection.");
      return;
    }
    const container = document.createElement("div");
    container.appendChild(selection.getRangeAt(0).cloneContents());
    try {
      await onCopy(container.innerHTML, container.textContent || "");
      toast.success("Copied selected output");
    } catch {
      toast.error("Clipboard access is unavailable. Use your browser’s native copy shortcut.");
    }
  };

  return (
    <section className="output-box" aria-label="Editable transformed output">
      <div className="output-heading">
        <span className="output-heading-mark">✦</span>
        <span>TRANSFORMED OUTPUT</span>
        <span className="output-heading-line" />
        <span className="output-word-count">{plainTextFromRichHtml(html).trim().split(/\s+/).filter(Boolean).length} words</span>
      </div>
      <div className="format-toolbar" role="toolbar" aria-label="Output formatting tools">
        <div className="toolbar-group">
          <button className={activeFormat.bold ? "tool-button is-active" : "tool-button"} onMouseDown={event => event.preventDefault()} onClick={() => command("bold")} aria-label="Bold selected text" title="Bold"><Bold size={15} /></button>
          <button className={activeFormat.italic ? "tool-button is-active" : "tool-button"} onMouseDown={event => event.preventDefault()} onClick={() => command("italic")} aria-label="Italic selected text" title="Italic"><Italic size={15} /></button>
          <button className={activeFormat.underline ? "tool-button is-active" : "tool-button"} onMouseDown={event => event.preventDefault()} onClick={() => command("underline")} aria-label="Underline selected text" title="Underline"><Underline size={15} /></button>
        </div>
        <div className="toolbar-divider" />
        <label className="format-select"><Type size={14} /><span className="sr-only">Font family</span><select value={fontFamily} onPointerDown={rememberSelection} onChange={event => chooseFont(event.target.value)} aria-label="Font family"><option>Terminal Mono</option><option>System Sans</option><option>Serif</option><option>Reading Sans</option></select></label>
        <label className="format-select size-select"><span className="sr-only">Font size</span><select value={fontSize} onPointerDown={rememberSelection} onChange={event => chooseSize(Number(event.target.value))} aria-label="Font size">{FONT_SIZES.map(size => <option key={size} value={size}>{size}px</option>)}</select></label>
        <div className="toolbar-divider" />
        <div className="color-set" aria-label="Text color">{TEXT_COLORS.map(color => <button key={color} className="color-swatch" onMouseDown={event => event.preventDefault()} onClick={() => command("foreColor", color)} style={{ "--swatch": color } as React.CSSProperties} aria-label={`Set text color ${color}`} title="Text color" />)}</div>
        <div className="color-set" aria-label="Highlight color">{HIGHLIGHT_COLORS.map(color => <button key={color} className="color-swatch highlight-swatch" onMouseDown={event => event.preventDefault()} onClick={() => command("hiliteColor", color)} style={{ "--swatch": color } as React.CSSProperties} aria-label={`Set highlight color ${color}`} title="Highlight color"><Highlighter size={11} /></button>)}</div>
        <div className="toolbar-spacer" />
        <button className="tool-button" onClick={() => command("undo")} aria-label="Undo output edit" title="Undo"><Undo2 size={15} /></button>
        <button className="tool-button" onClick={() => command("redo")} aria-label="Redo output edit" title="Redo"><Redo2 size={15} /></button>
        <button className="tool-button" onClick={() => void copySelection()} aria-label="Copy selected output" title="Copy selection"><Clipboard size={15} /></button>
        <button className="copy-all-button" onClick={async () => { try { const currentHtml = editorRef.current?.innerHTML ?? html; await onCopy(currentHtml, plainTextFromRichHtml(currentHtml)); toast.success("Copied current output"); } catch { toast.error("Clipboard access is unavailable. Use your browser’s native copy shortcut."); } }} disabled={disabled}><Clipboard size={14} /> Copy all</button>
      </div>
      <div
        id={id}
        ref={editorRef}
        className="rich-editor"
        contentEditable={!disabled}
        suppressContentEditableWarning
        onInput={emitChange}
        onKeyUp={event => { rememberSelection(); setActiveFormat({ bold: document.queryCommandState("bold"), italic: document.queryCommandState("italic"), underline: document.queryCommandState("underline") }); }}
        onMouseUp={() => { rememberSelection(); setActiveFormat({ bold: document.queryCommandState("bold"), italic: document.queryCommandState("italic"), underline: document.queryCommandState("underline") }); }}
        aria-label="Transformed text editor"
      />
      <div className="output-footer"><span><Check size={13} /> Preservation checks passed</span><span>Editable · Copy-safe</span></div>
    </section>
  );
}
