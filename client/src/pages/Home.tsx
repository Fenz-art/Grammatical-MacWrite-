import RichOutputEditor from "@/components/RichOutputEditor";
import {
  Menubar,
  MenubarContent,
  MenubarItem,
  MenubarMenu,
  MenubarSeparator,
  MenubarShortcut,
  MenubarTrigger,
} from "@/components/ui/menubar";
import { parseTerminalInput } from "@shared/commands";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { SemanticAnalysisPanel } from "@/components/SemanticAnalysisPanel";
import { TransformSettingsPanel } from "@/components/TransformSettingsPanel";
import { BenchmarkDashboard } from "@/components/BenchmarkDashboard";
import { DocumentReviewSettingsPanel } from "@/components/DocumentReviewSettingsPanel";
import { TrackedChangesReview } from "@/components/TrackedChangesReview";
import { MarkdownPreviewPanel } from "@/components/MarkdownPreviewPanel";
import { pasteWrapperLabel, splitPasteBlocks, downloadTextFile, buildDownloadAllText, outputFilename, type PasteBlock } from "@shared/pasteBlocks";
import { plainTextFromRichHtml, richHtmlFromPlainText } from "@shared/richText";
import { downloadChangeReport, downloadRichFormats, downloadSemanticAnalysis, richHtmlToMarkdownText, type ChangeReportExportFormat, type SemanticAnalysisExportFormat } from "@/lib/exportFormats";
import { parseTransformStreamFrame, splitTransformStreamFrames, transformStreamUrl } from "../../../shared/transformStreamTransport";
import {
  TRANSFORMATION_MODE_LABELS,
  type TransformationIntensity,
  type TransformInput,
  type TransformationMode,
  type TransformationStreamEvent,
} from "@shared/transformations";
import type { PassageSemanticContext } from "@shared/semanticContext";
import { WRITING_PROFILES, createDocumentReview, finalizeDocumentReview, reopenDocumentReview, reviewedText, type DocumentReview, type SemanticRisk, type WritingProfileId } from "@shared/documentReview";
import {
  AppWindow,
  CheckCheck,
  BookOpenCheck,
  Clipboard,
  Command,
  Expand,
  FilePlus2,
  HelpCircle,
  Minimize2,
  Moon,
  MoreHorizontal,
  RotateCcw,
  SendHorizontal,
  Settings2,
  ShieldCheck,
  Sparkles,
  BarChart3,
  TerminalSquare,
  Wifi,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { AuthDialog } from "@/components/AuthDialog";

type OutputEntry = {
  id: string;
  kind: "output";
  mode: TransformationMode;
  html: string;
  status: "streaming" | "complete" | "rejected";
  elapsedMs?: number;
  model?: string;
  intensity?: TransformationIntensity;
  semanticContext?: PassageSemanticContext;
  semanticRisks?: SemanticRisk[];
  sourceText?: string;
  documentReview?: DocumentReview;
  warning?: string;
  blockId?: string;
  blockIndex?: number;
  historyId?: string;
};

type PasteBlockEntry = { id: string; kind: "paste-block"; block: PasteBlock; mode: TransformationMode; status: "queued" | "active" | "complete" | "error" };
type ActiveDocument = { documentId: string; title: string; profileId: WritingProfileId; protectedTerms: string[]; codeCommentOnly: boolean; sourceText: string; blocks: PasteBlock[] };

type TranscriptEntry =
  | { id: string; kind: "system" | "help" | "input"; text: string; mode?: TransformationMode; blockId?: string }
  | { id: string; kind: "error"; text: string; retry?: { text: string; mode: TransformationMode; block?: PasteBlock }; blockId?: string }
  | { id: string; kind: "processing"; mode: TransformationMode; blockId?: string }
  | PasteBlockEntry
  | OutputEntry;

const MODE_META: Record<TransformationMode, { label: string; description: string; accent: string; icon: typeof CheckCheck }> = {
  proofread: { label: "Proofread", description: "Correct mechanics with minimal edits", accent: "mint", icon: CheckCheck },
  improve: { label: "Improve", description: "Clarify and polish your writing", accent: "blue", icon: Sparkles },
  natural: { label: "Natural", description: "Make the tone more conversational", accent: "coral", icon: MoreHorizontal },
  rewrite: { label: "Rewrite", description: "Restructure for readability", accent: "violet", icon: RotateCcw },
};

const INTENSITY_META: Record<TransformationIntensity, { label: string; description: string }> = {
  low: { label: "Low", description: "Conservative, mechanical repairs only" },
  standard: { label: "Standard", description: "Balanced semantic and stylistic improvement" },
  high: { label: "High", description: "Confident restructuring within semantic safeguards" },
};

const WELCOME: TranscriptEntry[] = [
  { id: "system-welcome", kind: "system", text: "Grammatical semantic workspace ready. The model proposes; Grammatical decides." },
  { id: "system-hint", kind: "system", text: "Choose a Dock mode, paste text, and press Enter. Type help for local commands." },
  { id: "system-tip", kind: "system", text: "Tip: long pastes are grouped at paragraph, line, and sentence boundaries before transformation." },
];

const EMPTY_REQUEST: TransformInput = { requestId: "idle", text: "idle", mode: "proofread", clientRevision: 0 };

function clockText(date: Date) {
  return new Intl.DateTimeFormat(undefined, { weekday: "short", hour: "2-digit", minute: "2-digit" }).format(date);
}

export default function Home() {
  const [activeMode, setActiveMode] = useState<TransformationMode>("improve");
  const [modeIntensities, setModeIntensities] = useState<Record<TransformationMode, TransformationIntensity>>({ proofread: "low", improve: "standard", natural: "standard", rewrite: "high" });
  const [entries, setEntries] = useState<TranscriptEntry[]>(WELCOME);
  const [draft, setDraft] = useState("");
  const [activeRequest, setActiveRequest] = useState<TransformInput | null>(null);
  const [activeBlock, setActiveBlock] = useState<PasteBlock | null>(null);
  const [pendingBlocks, setPendingBlocks] = useState<PasteBlock[]>([]);
  const [clock, setClock] = useState(() => new Date());
  const [terminal, setTerminal] = useState({ open: true, minimized: false, maximized: false, x: 96, y: 70 });
  const [reduceMotion, setReduceMotion] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [authDialogOpen, setAuthDialogOpen] = useState(false);
  const [authReason, setAuthReason] = useState<"transform" | "history">("transform");
  const [intensityOpen, setIntensityOpen] = useState(false);
  const [dashboardOpen, setDashboardOpen] = useState(false);
  const [reviewSettingsOpen, setReviewSettingsOpen] = useState(false);
  const [historySearch, setHistorySearch] = useState("");
  const [documentTitle, setDocumentTitle] = useState("Untitled document");
  const [writingProfile, setWritingProfile] = useState<WritingProfileId>("professional");
  const [protectedTerms, setProtectedTerms] = useState<string[]>([]);
  const [codeCommentOnly, setCodeCommentOnly] = useState(false);
  const [sessionId, setSessionId] = useState(() => crypto.randomUUID());
  const historyEditTimers = useRef<Record<string, number>>({});
  const auth = useAuth();
  const historySearchInput = useMemo(() => ({ search: historySearch || undefined }), [historySearch]);
  const historyQuery = trpc.history.list.useQuery(historySearchInput, { enabled: auth.isAuthenticated, retry: false });
  const historyCreate = trpc.history.create.useMutation({ onSuccess: () => void historyQuery.refetch() });
  const historyUpdate = trpc.history.update.useMutation();
  const historyDelete = trpc.history.delete.useMutation({ onSuccess: () => void historyQuery.refetch() });
  const metricsQuery = trpc.metrics.snapshot.useQuery(undefined, { enabled: auth.isAuthenticated, retry: false, refetchOnWindowFocus: false });
  const historySessions = useMemo(() => {
    const groups = new Map<string, NonNullable<typeof historyQuery.data>>();
    for (const record of historyQuery.data ?? []) {
      const current = groups.get(record.sessionId) ?? [];
      current.push(record);
      groups.set(record.sessionId, current);
    }
    return Array.from(groups.entries()).map(([id, records]) => ({ id, records }));
  }, [historyQuery.data]);
  const [liveMessage, setLiveMessage] = useState("Grammatical semantic workspace ready.");
  const transcriptRef = useRef<HTMLDivElement>(null);
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const draggingRef = useRef<{ pointerX: number; pointerY: number; startX: number; startY: number } | null>(null);
  const activeRequestRef = useRef<TransformInput | null>(null);
  const activeDocumentRef = useRef<ActiveDocument | null>(null);
  const suppressNextPromptInputRef = useRef(false);

  const isBusy = Boolean(activeRequest);
  const modeLabel = TRANSFORMATION_MODE_LABELS[activeMode];

  useEffect(() => {
    const timer = window.setInterval(() => setClock(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("grammatical.mode-intensities");
      if (!saved) return;
      const parsed = JSON.parse(saved) as Partial<Record<TransformationMode, TransformationIntensity>>;
      setModeIntensities(current => ({ ...current, ...parsed }));
    } catch {
      // Invalid local preferences never block a transformation.
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem("grammatical.mode-intensities", JSON.stringify(modeIntensities));
  }, [modeIntensities]);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("grammatical.document-review-settings");
      if (!saved) return;
      const parsed = JSON.parse(saved) as Partial<{ title: string; profileId: WritingProfileId; protectedTerms: string[]; codeCommentOnly: boolean }>;
      if (typeof parsed.title === "string") setDocumentTitle(parsed.title.slice(0, 120) || "Untitled document");
      if (parsed.profileId && Object.hasOwn(WRITING_PROFILES, parsed.profileId)) setWritingProfile(parsed.profileId);
      if (Array.isArray(parsed.protectedTerms)) setProtectedTerms(Array.from(new Set(parsed.protectedTerms.map(term => String(term).trim()).filter(Boolean))).slice(0, 50));
      if (typeof parsed.codeCommentOnly === "boolean") setCodeCommentOnly(parsed.codeCommentOnly);
    } catch {
      // Invalid local preferences never block a document transformation.
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem("grammatical.document-review-settings", JSON.stringify({ title: documentTitle, profileId: writingProfile, protectedTerms, codeCommentOnly }));
  }, [documentTitle, writingProfile, protectedTerms, codeCommentOnly]);

  useEffect(() => {
    if (!terminal.minimized && terminal.open) window.setTimeout(() => promptRef.current?.focus(), 80);
  }, [terminal.minimized, terminal.open]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || !event.altKey) return;
      const key = event.key.toLowerCase();
      if (key === "i") {
        event.preventDefault();
        event.stopPropagation();
        suppressNextPromptInputRef.current = true;
        window.setTimeout(() => { suppressNextPromptInputRef.current = false; }, 0);
        setIntensityOpen(open => !open);
        return;
      }
      if (key === "b") {
        event.preventDefault();
        event.stopPropagation();
        suppressNextPromptInputRef.current = true;
        window.setTimeout(() => { suppressNextPromptInputRef.current = false; }, 0);
        setDashboardOpen(open => !open);
        void metricsQuery.refetch();
      }
    };
    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", onKeyDown, { capture: true });
  }, [metricsQuery.refetch]);

  useEffect(() => {
    const node = transcriptRef.current;
    if (!node) return;
    const nearBottom = node.scrollHeight - node.scrollTop - node.clientHeight < 96;
    if (nearBottom) node.scrollTo({ top: node.scrollHeight, behavior: reduceMotion ? "auto" : "smooth" });
  }, [entries, reduceMotion]);

  const append = (entry: TranscriptEntry) => setEntries(previous => [...previous, entry]);

  const latestOutput = useMemo(
    () => [...entries].reverse().find((entry): entry is OutputEntry => entry.kind === "output" && entry.status === "complete"),
    [entries]
  );

  const updateOutput = (id: string, update: (output: OutputEntry) => OutputEntry) => {
    setEntries(previous => previous.map(entry => {
      if (entry.kind !== "output" || entry.id !== id) return entry;
      const next = update(entry);
      if (next.historyId && auth.isAuthenticated && next.status === "complete") {
        window.clearTimeout(historyEditTimers.current[next.historyId]);
        historyEditTimers.current[next.historyId] = window.setTimeout(() => {
          void historyUpdate.mutateAsync({ id: next.historyId!, outputHtml: next.html, outputText: plainTextFromRichHtml(next.html) }).catch(() => undefined);
        }, 700);
      }
      return next;
    }));
  };

  const documentContextFor = (block?: PasteBlock) => {
    const document = activeDocumentRef.current;
    if (!document) return undefined;
    const blockIndex = block?.index ?? 0;
    const beforeExcerpt = document.blocks.slice(0, blockIndex).map(item => item.text).join("").slice(-520) || undefined;
    const afterExcerpt = document.blocks.slice(blockIndex + 1).map(item => item.text).join("").slice(0, 520) || undefined;
    return { documentId: document.documentId, title: document.title, blockIndex, blockCount: document.blocks.length, totalCharacters: document.sourceText.length, beforeExcerpt, afterExcerpt, profileId: document.profileId };
  };

  const copyRich = async (html: string, plainText: string) => {
    try {
      if (navigator.clipboard && "write" in navigator && typeof ClipboardItem !== "undefined") {
        await navigator.clipboard.write([new ClipboardItem({
          "text/plain": new Blob([plainText], { type: "text/plain" }),
          "text/html": new Blob([html], { type: "text/html" }),
        })]);
      } else {
        if (!navigator.clipboard?.writeText) throw new Error("Clipboard API unavailable");
        await navigator.clipboard.writeText(plainText);
      }
    } catch (richError) {
      try {
        if (!navigator.clipboard?.writeText) throw richError;
        await navigator.clipboard.writeText(plainText);
        toast.info("Copied plain text because formatted clipboard access is unavailable");
      } catch {
        toast.error("Clipboard access is unavailable. Select the output and use your browser’s copy shortcut.");
        throw new Error("Clipboard access unavailable");
      }
    }
  };

  const downloadOutput = (output: OutputEntry) => {
    downloadTextFile(outputFilename(output.blockIndex ?? 0), plainTextFromRichHtml(output.html));
    toast.success(`Downloaded ${outputFilename(output.blockIndex ?? 0)}`);
  };

  const exportOutputFormats = async (output: OutputEntry) => {
    if (output.status !== "complete") return;
    await downloadRichFormats(output.html, `${MODE_META[output.mode].label} output`);
    toast.success("Downloaded Markdown, HTML, and DOCX exports");
  };

  const exportOutputSemanticAnalysis = (output: OutputEntry, format: SemanticAnalysisExportFormat) => {
    if (output.status !== "complete" || !output.semanticContext) return;
    downloadSemanticAnalysis(output.semanticContext, `${MODE_META[output.mode].label} output`, format);
    toast.success(`Downloaded semantic analysis as ${format === "json" ? "JSON" : "Markdown"}`);
  };

  const exportOutputChangeReport = (output: OutputEntry, format: ChangeReportExportFormat) => {
    if (!output.documentReview) return;
    if (!output.documentReview.finalizedAt || output.documentReview.stale) return toast.error("Finalize the side-by-side review before exporting its change report.");
    const document = activeDocumentRef.current;
    downloadChangeReport({ title: document?.title || `${MODE_META[output.mode].label} output`, review: output.documentReview, risks: output.semanticRisks ?? [], profileLabel: WRITING_PROFILES[document?.profileId ?? writingProfile].label, format });
    toast.success(`Downloaded change report as ${format === "json" ? "JSON" : "Markdown"}`);
  };

  const exportTranscriptFormats = async () => {
    const html = entries.filter((entry): entry is OutputEntry => entry.kind === "output" && entry.status === "complete").map(entry => `<h2>${MODE_META[entry.mode].label}</h2>${entry.html}`).join("<hr />");
    if (!html) return toast.error("No completed outputs are available to export.");
    await downloadRichFormats(html, "Grammatical transcript");
    toast.success("Downloaded transcript Markdown, HTML, and DOCX exports");
  };

  const downloadAllOutputs = () => {
    const outputs = entries
      .filter((entry): entry is OutputEntry => entry.kind === "output" && entry.status === "complete")
      .map((entry, fallbackIndex) => ({ index: entry.blockIndex ?? fallbackIndex, text: plainTextFromRichHtml(entry.html) }));
    if (!outputs.length) return toast.error("No completed outputs are available to download.");
    downloadTextFile("outputs.txt", buildDownloadAllText(outputs));
    toast.success(`Downloaded ${outputs.length} output${outputs.length === 1 ? "" : "s"} in outputs.txt`);
  };

  const restoreHistory = (record: NonNullable<typeof historyQuery.data>[number]) => {
    setActiveMode(record.mode);
    setEntries([
      { id: crypto.randomUUID(), kind: "system", text: `Restored ${record.title} from persistent history.` },
      { id: crypto.randomUUID(), kind: "input", text: record.inputText || "Restored edited output", mode: record.mode },
      { id: record.id, kind: "output", mode: record.mode, html: record.outputHtml, status: "complete", historyId: record.id },
    ]);
    setHistoryOpen(false);
    setLiveMessage("History record restored into the terminal.");
  };

  const copyLatestOutput = async () => {
    if (!latestOutput) {
      append({ id: crypto.randomUUID(), kind: "error", text: "No completed output is available to copy." });
      return;
    }
    const plain = plainTextFromRichHtml(latestOutput.html);
    await copyRich(latestOutput.html, plain);
    append({ id: crypto.randomUUID(), kind: "system", text: "Copied the current edited output to the clipboard." });
    setLiveMessage("Copied the current edited output to the clipboard.");
  };

  const newSession = () => {
    if (isBusy) return toast.error("Cancel the active transformation before starting a new session.");
    setEntries(WELCOME.map(entry => ({ ...entry, id: crypto.randomUUID() })));
    setDraft("");
    activeDocumentRef.current = null;
    setSessionId(crypto.randomUUID());
    setLiveMessage("New Grammatical session started.");
    toast.success("New Grammatical session started");
  };

  const selectMode = (mode: TransformationMode) => {
    setActiveMode(mode);
    setLiveMessage(`${MODE_META[mode].label} mode selected.`);
  };

  const startTransform = (text: string, mode: TransformationMode, block?: PasteBlock) => {
    const request: TransformInput = { requestId: crypto.randomUUID(), text, mode, intensity: modeIntensities[mode], protectedTerms: activeDocumentRef.current?.protectedTerms, codeCommentOnly: activeDocumentRef.current?.codeCommentOnly, documentContext: documentContextFor(block), clientRevision: Date.now() };
    append({ id: crypto.randomUUID(), kind: "input", text: block ? pasteWrapperLabel(block) : text, mode, blockId: block?.id });
    append({ id: request.requestId, kind: "processing", mode, blockId: block?.id });
    if (block) setEntries(previous => previous.map(entry => entry.kind === "paste-block" && entry.block.id === block.id ? { ...entry, status: "active" } : entry));
    setActiveBlock(block ?? null);
    activeRequestRef.current = request;
    setActiveRequest(request);
    setLiveMessage(`Transforming text in ${TRANSFORMATION_MODE_LABELS[mode]} mode with the ${WRITING_PROFILES[writingProfile].label} profile.`);
  };

  const submit = async () => {
    if (isBusy) return;
    if (draft.length === 0) return;
    const parsed = parseTerminalInput(draft);
    setDraft("");

    if (parsed.type === "clear") return newSession();
    if (parsed.type === "help") {
      append({ id: crypto.randomUUID(), kind: "help", text: "Local commands: clear · mode <proofread|improve|natural|rewrite> · copy-output · help\nShortcuts: ⌘/Ctrl+Enter submit · ⌘/Ctrl+Shift+C copy output · ⌘/Ctrl+Alt+I intensity · ⌘/Ctrl+Alt+B benchmark dashboard · Escape cancel" });
      return;
    }
    if (parsed.type === "copy-output") return copyLatestOutput();
    if (parsed.type === "mode") {
      selectMode(parsed.mode);
      append({ id: crypto.randomUUID(), kind: "system", text: `Active mode changed to ${TRANSFORMATION_MODE_LABELS[parsed.mode]}.` });
      return;
    }
    if (parsed.type === "invalid-mode") {
      append({ id: crypto.randomUUID(), kind: "error", text: "Unknown mode. Choose proofread, improve, natural, or rewrite." });
      return;
    }

    if (!auth.isAuthenticated) {
      setDraft(parsed.text);
      setAuthReason("transform");
      setAuthDialogOpen(true);
      append({ id: crypto.randomUUID(), kind: "system", text: "Authentication required for transformation. Source text remains preserved in the prompt." });
      setLiveMessage("Sign in to continue. Your source text is preserved in the prompt.");
      return;
    }

    const blocks = splitPasteBlocks(parsed.text);
    activeDocumentRef.current = { documentId: crypto.randomUUID(), title: documentTitle.trim() || "Untitled document", profileId: writingProfile, protectedTerms, codeCommentOnly, sourceText: parsed.text, blocks };
    append({ id: crypto.randomUUID(), kind: "system", text: `${WRITING_PROFILES[writingProfile].label} profile active${protectedTerms.length ? ` · ${protectedTerms.length} protected term${protectedTerms.length === 1 ? "" : "s"}` : " · no custom protected terms"}${codeCommentOnly ? " · code-comment mode on" : ""}.` });
    const isLargePaste = blocks.length > 1 || blocks[0].charCount > 1_800;
    if (isLargePaste) {
      append({ id: crypto.randomUUID(), kind: "system", text: `${blocks.length} paste block${blocks.length === 1 ? "" : "s"} detected. Grammatical will transform them in order.` });
      blocks.forEach(block => append({ id: `paste-${block.id}`, kind: "paste-block", block, mode: activeMode, status: "queued" as const }));
      setPendingBlocks(blocks.slice(1));
      startTransform(blocks[0].text, activeMode, blocks[0]);
    } else {
      startTransform(parsed.text, activeMode);
    }
  };

  const handleStream = (event: TransformationStreamEvent) => {
    const request = activeRequestRef.current;
    if (!request || event.requestId !== request.requestId) return;
    if (event.type === "delta") {
      const outputId = `output-${event.requestId}`;
      setEntries(previous => {
        const existing = previous.find(entry => entry.kind === "output" && entry.id === outputId) as OutputEntry | undefined;
        if (!existing) return [...previous.filter(entry => entry.kind !== "processing" || entry.id !== event.requestId), { id: outputId, kind: "output", mode: request.mode, html: richHtmlFromPlainText(event.text), status: "streaming", sourceText: request.text, blockId: activeBlock?.id, blockIndex: activeBlock?.index, historyId: request.requestId }];
        return previous.map(entry => entry.kind === "output" && entry.id === outputId ? { ...entry, html: entry.html + richHtmlFromPlainText(event.text) } : entry);
      });
      return;
    }
    if (event.type === "complete") {
      const outputId = `output-${event.requestId}`;
      const completedHtml = richHtmlFromPlainText(event.result.text);
      updateOutput(outputId, output => ({ ...output, html: completedHtml, status: "complete", elapsedMs: event.result.elapsedMs, model: event.result.model, intensity: event.result.intensity, semanticContext: event.result.semanticContext, semanticRisks: event.result.semanticRisks, sourceText: request.text, documentReview: createDocumentReview(request.text, event.result.text), historyId: request.requestId }));
      if (auth.isAuthenticated) {
        void historyCreate.mutateAsync({ id: request.requestId, sessionId, mode: request.mode, title: `${MODE_META[request.mode].label}: ${request.text.trim().slice(0, 120)}`, inputText: request.text, outputHtml: completedHtml, outputText: event.result.text, blockCount: 1 }).catch(() => undefined);
      }
      const nextBlock = pendingBlocks[0];
      if (activeBlock) setEntries(previous => previous.map(entry => entry.kind === "paste-block" && entry.block.id === activeBlock.id ? { ...entry, status: "complete" } : entry));
      activeRequestRef.current = null;
      setActiveRequest(null);
      setActiveBlock(null);
      if (nextBlock) {
        setPendingBlocks(previous => previous.slice(1));
        window.setTimeout(() => startTransform(nextBlock.text, request.mode, nextBlock), 0);
        setLiveMessage(`Block ${nextBlock.index + 1} queued. Continuing in ${TRANSFORMATION_MODE_LABELS[request.mode]} mode.`);
      } else {
        setLiveMessage("Transformation complete. Output is ready to edit.");
      }
      void metricsQuery.refetch();
      return;
    }
    if (event.type === "rejected") {
      const failedBlock = activeBlock;
      if (failedBlock) setEntries(previous => previous.map(entry => entry.kind === "paste-block" && entry.block.id === failedBlock.id ? { ...entry, status: "error" } : entry));
      setEntries(previous => [
        ...previous.filter(entry => entry.kind !== "processing" || entry.id !== event.requestId),
        { id: `output-${event.requestId}`, kind: "output", mode: request.mode, html: richHtmlFromPlainText(event.fallbackText), status: "rejected", warning: event.reason, semanticRisks: event.semanticRisks, sourceText: request.text, blockId: failedBlock?.id, blockIndex: failedBlock?.index },
      ]);
      activeRequestRef.current = null;
      setActiveRequest(null);
      setActiveBlock(null);
      setLiveMessage(failedBlock ? `Block ${failedBlock.index + 1} was retained because meaning may have shifted. Retry it to continue the queue.` : "The result was held because meaning may have shifted. Original text retained for review.");
      void metricsQuery.refetch();
      return;
    }
    if (event.type === "error") {
      const failedBlock = activeBlock;
      if (failedBlock) setEntries(previous => previous.map(entry => entry.kind === "paste-block" && entry.block.id === failedBlock.id ? { ...entry, status: "error" } : entry));
      const copy = event.code === "CANCELLED"
        ? "Transformation cancelled. Your input is preserved above."
        : event.code === "AUTH_REQUIRED"
          ? "Your session expired. Sign in again before retrying; your input is preserved."
          : event.code === "RATE_LIMITED"
            ? "Your transformation quota is temporarily exhausted. Try again after the stated limit window."
            : event.code === "CAPACITY_EXHAUSTED"
              ? "Grammatical is protecting active work from a traffic burst. Try again shortly."
              : event.code === "BUDGET_EXHAUSTED" || event.code === "PROVIDER_CIRCUIT_OPEN"
                ? "The provider safety guard is temporarily active. Your input is preserved; try again later."
                : event.code === "PROVIDER_NOT_CONFIGURED"
                  ? "LLM provider configuration is incomplete. Configure LLM_API_KEY and LLM_MODEL, plus a key and model for any enabled fallback; your input is preserved."
                : event.code === "DEADLINE_EXCEEDED"
                  ? "The provider did not complete within the safety deadline. Your input is preserved."
                  : "This block could not be transformed after automatic retries. Your input is preserved.";
      setEntries(previous => [...previous.filter(entry => entry.kind !== "processing" || entry.id !== event.requestId), { id: crypto.randomUUID(), kind: "error", text: failedBlock ? `Block ${failedBlock.index + 1}: ${copy}` : copy, blockId: failedBlock?.id, retry: event.retryable ? { text: request.text, mode: request.mode, block: failedBlock ?? undefined } : undefined }]);
      activeRequestRef.current = null;
      setActiveRequest(null);
      setActiveBlock(null);
      setLiveMessage(failedBlock ? `Block ${failedBlock.index + 1} needs a retry. Queued blocks are preserved.` : copy);
      void metricsQuery.refetch();
    }
  };

  useEffect(() => {
    if (!activeRequest) return;
    const request = activeRequest;
    const controller = new AbortController();
    let finished = false;

    const emitError = (code: "AUTH_REQUIRED" | "NETWORK_LOST" | "SERVICE_UNAVAILABLE") => {
      if (finished || activeRequestRef.current?.requestId !== request.requestId) return;
      finished = true;
      handleStream({ type: "error", requestId: request.requestId, code, retryable: code !== "AUTH_REQUIRED" });
    };

    const consume = async () => {
      try {
        const response = await fetch(transformStreamUrl(request), {
          credentials: "include",
          signal: controller.signal,
        });
        if (!response.ok) {
          emitError(response.status === 401 || response.status === 403 ? "AUTH_REQUIRED" : response.status === 429 ? "SERVICE_UNAVAILABLE" : "SERVICE_UNAVAILABLE");
          return;
        }
        if (!response.body) {
          emitError("NETWORK_LOST");
          return;
        }
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        while (!finished) {
          const chunk = await reader.read();
          if (chunk.done) break;
          buffer += decoder.decode(chunk.value, { stream: true });
          const split = splitTransformStreamFrames(buffer);
          const frames = split.frames;
          buffer = split.remainder;
          for (const frame of frames) {
            try {
              const event = parseTransformStreamFrame(frame);
              if (!event) continue;
              handleStream(event);
              if (event.type === "complete" || event.type === "rejected" || event.type === "error") finished = true;
            } catch (error) {
              console.error("[Grammatical transform stream parse]", error);
              emitError("NETWORK_LOST");
              break;
            }
          }
        }
        if (!finished && !controller.signal.aborted && activeRequestRef.current?.requestId === request.requestId) emitError("NETWORK_LOST");
      } catch (error) {
        if (!controller.signal.aborted) {
          console.error("[Grammatical transform stream request]", error);
          emitError("NETWORK_LOST");
        }
      }
    };
    void consume();
    return () => {
      finished = true;
      controller.abort();
    };
  }, [activeRequest]);

  const cancel = () => {
    if (!activeRequest) return;
    const cancelled = activeRequest;
    activeRequestRef.current = null;
    setActiveRequest(null);
    setActiveBlock(null);
    setPendingBlocks([]);
    setEntries(previous => [...previous.map(entry => entry.kind === "paste-block" && entry.status === "active" ? { ...entry, status: "error" as const } : entry), ...previous.filter(entry => entry.kind !== "processing" || entry.id !== cancelled.requestId), { id: crypto.randomUUID(), kind: "error", text: "Transformation cancelled. Your input is preserved above." }]);
    setLiveMessage("Transformation cancelled. Your input is preserved.");
  };

  const onPromptKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.nativeEvent.isComposing) return;
    if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === "c") {
      event.preventDefault();
      void copyLatestOutput();
      return;
    }
    if (event.key === "Escape" && isBusy) {
      event.preventDefault();
      cancel();
      return;
    }
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void submit();
    }
  };

  const handleTitlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest("button")) return;
    draggingRef.current = { pointerX: event.clientX, pointerY: event.clientY, startX: terminal.x, startY: terminal.y };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  };

  const handleTitlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = draggingRef.current;
    if (!drag || terminal.maximized) return;
    setTerminal(current => ({ ...current, x: Math.max(12, Math.min(window.innerWidth - 280, drag.startX + event.clientX - drag.pointerX)), y: Math.max(34, Math.min(window.innerHeight - 140, drag.startY + event.clientY - drag.pointerY)) }));
  };

  const renderEntry = (entry: TranscriptEntry) => {
    if (entry.kind === "processing") return <div key={entry.id} className="terminal-processing"><span className="orbital-spinner" aria-hidden="true" /><span>Transforming text in {TRANSFORMATION_MODE_LABELS[entry.mode]} mode…</span><button onClick={cancel} className="cancel-button">Cancel</button></div>;
    if (entry.kind === "paste-block") return <details key={entry.id} className="paste-wrapper"><summary><span className="paste-wrapper-chevron">›</span><span>{pasteWrapperLabel(entry.block)}</span><span className="paste-wrapper-preview">{entry.block.preview}</span><span className="paste-wrapper-state">{entry.status}</span></summary><pre>{entry.block.text}</pre></details>;
    if (entry.kind === "output") return <div key={entry.id} className="terminal-output"><RichOutputEditor id={entry.id} html={entry.html} disabled={entry.status === "streaming"} onChange={html => updateOutput(entry.id, output => ({ ...output, html, documentReview: output.documentReview ? { ...output.documentReview, stale: true, finalizedAt: undefined } : undefined }))} onCopy={copyRich} />{entry.status !== "streaming" ? <MarkdownPreviewPanel markdown={plainTextFromRichHtml(entry.html)} /> : null}{entry.status === "streaming" && <div className="streaming-note"><span className="orbital-spinner" /> Revealing validated result…</div>}{entry.status === "rejected" && <div className="validation-warning"><ShieldCheck size={15} /><span>{entry.warning} Original text retained for review.</span></div>}{entry.semanticRisks ? <TrackedChangesReview review={entry.documentReview ?? createDocumentReview(entry.sourceText ?? "", plainTextFromRichHtml(entry.html))} risks={entry.semanticRisks} onChange={review => updateOutput(entry.id, output => ({ ...output, html: richHtmlFromPlainText(reviewedText(review)), documentReview: review }))} onFinalize={review => updateOutput(entry.id, output => { const finalized = finalizeDocumentReview(review); return { ...output, html: richHtmlFromPlainText(reviewedText(finalized)), documentReview: finalized }; })} onReopen={review => updateOutput(entry.id, output => ({ ...output, documentReview: reopenDocumentReview(review) }))} /> : null}{entry.status === "complete" && entry.semanticContext ? <SemanticAnalysisPanel context={entry.semanticContext} onExport={format => exportOutputSemanticAnalysis(entry, format)} /> : null}<div className="result-meta"><span>{MODE_META[entry.mode].label}</span>{entry.intensity ? <span>{INTENSITY_META[entry.intensity].label} intensity</span> : null}{entry.elapsedMs ? <span>{(entry.elapsedMs / 1000).toFixed(1)}s</span> : null}{entry.status === "complete" && <><button className="download-output-button" onClick={() => downloadOutput(entry)}>Download {outputFilename(entry.blockIndex ?? 0)}</button><button className="download-output-button" onClick={() => void exportOutputFormats(entry)}>MD · HTML · DOCX</button>{entry.documentReview ? <><button className="download-output-button" disabled={!entry.documentReview.finalizedAt || entry.documentReview.stale} onClick={() => exportOutputChangeReport(entry, "json")}>Change JSON</button><button className="download-output-button" disabled={!entry.documentReview.finalizedAt || entry.documentReview.stale} onClick={() => exportOutputChangeReport(entry, "markdown")}>Change MD</button></> : null}</>}</div></div>;
    if (entry.kind === "input") return <div key={entry.id} className="terminal-input-line"><span className="terminal-prefix">[{TRANSFORMATION_MODE_LABELS[entry.mode || activeMode]}] &gt;</span><span>{entry.text}</span></div>;
    return <div key={entry.id} className={`terminal-${entry.kind}`}><span className="terminal-gutter">{entry.kind === "error" ? "!" : entry.kind === "help" ? "?" : "·"}</span><span>{entry.text}</span>{entry.kind === "error" && entry.retry ? <button className="retry-button" onClick={() => startTransform(entry.retry!.text, entry.retry!.mode, entry.retry!.block)}>Retry</button> : null}</div>;
  };

  const modeButton = (mode: TransformationMode) => {
    const meta = MODE_META[mode];
    const Icon = meta.icon;
    return <button key={mode} className={`dock-app ${activeMode === mode ? "is-active" : ""} ${meta.accent}`} onClick={() => selectMode(mode)} aria-label={`Switch to ${meta.label} mode`} title={meta.description}><span className="dock-icon"><Icon size={25} strokeWidth={1.9} /></span><span className="dock-label">{meta.label}</span>{activeMode === mode && <span className="dock-active-dot" />}</button>;
  };

  return (
    <main className={reduceMotion ? "desktop reduce-motion" : "desktop"}>
      <div className="wallpaper-orb orb-one" /><div className="wallpaper-orb orb-two" /><div className="wallpaper-orb orb-three" />
      <p className="sr-only" aria-live="polite" aria-atomic="true">{liveMessage}</p>
      <header className="system-bar">
        <Menubar className="system-menubar">
          <MenubarMenu><MenubarTrigger className="brand-trigger"><span className="brand-mark">G</span><span>Grammatical</span></MenubarTrigger><MenubarContent><MenubarItem onSelect={newSession}>New session <MenubarShortcut>⌘N</MenubarShortcut></MenubarItem><MenubarItem onSelect={() => setTerminal(current => ({ ...current, open: true, minimized: false }))}>Open Terminal</MenubarItem></MenubarContent></MenubarMenu>
          <MenubarMenu><MenubarTrigger>File</MenubarTrigger><MenubarContent><MenubarItem onSelect={newSession}><FilePlus2 size={14} /> New session</MenubarItem><MenubarItem onSelect={downloadAllOutputs}><Clipboard size={14} /> Download all outputs</MenubarItem><MenubarItem onSelect={() => void exportTranscriptFormats()}>Export transcript formats</MenubarItem><MenubarItem onSelect={() => { const text = entries.map(entry => entry.kind === "output" ? plainTextFromRichHtml(entry.html) : entry.kind === "processing" ? `Transforming text in ${TRANSFORMATION_MODE_LABELS[entry.mode]} mode…` : entry.kind === "paste-block" ? pasteWrapperLabel(entry.block) : entry.text).join("\n\n"); void navigator.clipboard.writeText(text); toast.success("Transcript copied as plain text"); }}>Copy transcript</MenubarItem><MenubarItem onSelect={() => setHistoryOpen(true)}>Transformation history</MenubarItem></MenubarContent></MenubarMenu>
          <MenubarMenu><MenubarTrigger>Edit</MenubarTrigger><MenubarContent><MenubarItem onSelect={() => void copyLatestOutput()}>Copy output <MenubarShortcut>⌘⇧C</MenubarShortcut></MenubarItem><MenubarSeparator /><MenubarItem onSelect={() => promptRef.current?.focus()}>Focus prompt <MenubarShortcut>⌘K</MenubarShortcut></MenubarItem></MenubarContent></MenubarMenu>
          <MenubarMenu><MenubarTrigger>View</MenubarTrigger><MenubarContent><MenubarItem onSelect={() => setReviewSettingsOpen(true)}><BookOpenCheck size={14} /> Document review setup</MenubarItem><MenubarItem onSelect={() => setIntensityOpen(true)}><Settings2 size={14} /> Transformation intensity</MenubarItem><MenubarItem onSelect={() => { setDashboardOpen(true); void metricsQuery.refetch(); }}><BarChart3 size={14} /> Benchmark dashboard</MenubarItem><MenubarSeparator /><MenubarItem onSelect={() => setReduceMotion(value => !value)}><Moon size={14} /> {reduceMotion ? "Enable motion" : "Reduce motion"}</MenubarItem></MenubarContent></MenubarMenu>
          <MenubarMenu><MenubarTrigger>Help</MenubarTrigger><MenubarContent><MenubarItem onSelect={() => append({ id: crypto.randomUUID(), kind: "help", text: "Commands: clear · mode <name> · copy-output · help" })}><HelpCircle size={14} /> Command guide</MenubarItem></MenubarContent></MenubarMenu>
        </Menubar>
        <div className="system-status"><span className="privacy-status"><ShieldCheck size={14} /> Semantic guard on</span>{auth.isAuthenticated ? <span className="privacy-status">Protected session</span> : <AuthDialog open={authDialogOpen} onOpenChange={setAuthDialogOpen} reason={authReason} context={authReason === "transform" ? { mode: TRANSFORMATION_MODE_LABELS[activeMode], title: documentTitle, characters: draft.length } : undefined} trigger={<button className="auth-status-button" onClick={() => setAuthReason("transform")}>Sign in to transform</button>} />}<span><Wifi size={14} /></span><span className="clock"><Command size={13} /> {clockText(clock)}</span></div>
      </header>

      {historyOpen && (
        <aside className="history-panel" aria-label="Transformation history">
          <div className="history-panel-header">
            <div>
              <strong>Transformation history</strong>
              <span>{auth.isAuthenticated ? "Persistent records for this account" : "Sign in to enable persistent history"}</span>
            </div>
            <button onClick={() => setHistoryOpen(false)} aria-label="Close history"><X size={15} /></button>
          </div>
          {auth.isAuthenticated ? (
            <>
              <input className="history-search" value={historySearch} onChange={event => setHistorySearch(event.target.value)} placeholder="Search title, input, or output" aria-label="Search transformation history" />
              {historyQuery.isLoading ? <p className="history-empty">Loading history…</p> : historySessions.length ? (
                <div className="history-list">
                  {historySessions.map(session => (
                    <section className="history-session" key={session.id}>
                      <div className="history-session-heading"><span>Session {session.id.slice(0, 8)}</span><small>{session.records.length} transformation{session.records.length === 1 ? "" : "s"}</small></div>
                      {session.records.map(record => (
                        <article className="history-record" key={record.id}>
                          <button className="history-record-main" onClick={() => restoreHistory(record)}><span>{record.title}</span><small>{MODE_META[record.mode].label} · {new Date(record.createdAt).toLocaleString()}</small></button>
                          <button className="history-delete" onClick={() => { if (window.confirm("Delete this history record?")) historyDelete.mutate({ id: record.id }); }} aria-label={`Delete ${record.title}`}><X size={14} /></button>
                        </article>
                      ))}
                    </section>
                  ))}
                </div>
              ) : <p className="history-empty">No saved transformations match this search.</p>}
            </>
          ) : (
            <>
              <p className="history-empty">Persistent history is account-scoped. Sign in to save and search transformations.</p>
              <button className="history-login" onClick={() => { setAuthReason("history"); setAuthDialogOpen(true); }}>Sign in</button>
            </>
          )}
        </aside>
      )}
      {reviewSettingsOpen && <DocumentReviewSettingsPanel title={documentTitle} profileId={writingProfile} protectedTerms={protectedTerms} sourceText={draft || activeDocumentRef.current?.sourceText || ""} codeCommentOnly={codeCommentOnly} onTitleChange={setDocumentTitle} onProfileChange={setWritingProfile} onProtectedTermsChange={setProtectedTerms} onCodeCommentOnlyChange={setCodeCommentOnly} onClose={() => setReviewSettingsOpen(false)} />}
      {intensityOpen && <aside className="overlay-panel intensity-overlay" aria-label="Transformation intensity settings"><div className="history-panel-header"><div><strong>Transformation intensity</strong><span>Saved locally for each mode</span></div><button onClick={() => setIntensityOpen(false)} aria-label="Close transformation intensity settings"><X size={15} /></button></div>{(["proofread", "improve", "natural", "rewrite"] as TransformationMode[]).map(mode => <TransformSettingsPanel key={mode} mode={mode} intensity={modeIntensities[mode]} onChange={intensity => setModeIntensities(current => ({ ...current, [mode]: intensity }))} />)}</aside>}
      {dashboardOpen && <BenchmarkDashboard metrics={metricsQuery.data} isLoading={metricsQuery.isLoading || metricsQuery.isFetching} onRefresh={() => void metricsQuery.refetch()} onClose={() => setDashboardOpen(false)} />}

      {terminal.open && !terminal.minimized ? <section className={terminal.maximized ? "terminal-window is-maximized" : "terminal-window"} style={terminal.maximized ? undefined : { left: terminal.x, top: terminal.y }} aria-label="Grammatical Terminal">
        <div className="terminal-titlebar" onPointerDown={handleTitlePointerDown} onPointerMove={handleTitlePointerMove} onPointerUp={() => { draggingRef.current = null; }}>
          <div className="traffic-lights"><button className="traffic close" onClick={() => setTerminal(current => ({ ...current, open: false }))} aria-label="Close terminal"><X size={9} /></button><button className="traffic minimize" onClick={() => setTerminal(current => ({ ...current, minimized: true }))} aria-label="Minimize terminal"><Minimize2 size={8} /></button><button className="traffic maximize" onClick={() => setTerminal(current => ({ ...current, maximized: !current.maximized }))} aria-label="Toggle maximize terminal"><Expand size={8} /></button></div>
          <div className="terminal-title"><TerminalSquare size={15} /> Terminal <span>· {MODE_META[activeMode].label}</span></div><div className="terminal-title-status">session active</div>
        </div>
        <div className="terminal-body" ref={transcriptRef} role="log" aria-live="off" aria-label="Grammatical Terminal session history">{entries.map(renderEntry)}<div className="prompt-row"><span className="terminal-prefix">[{modeLabel}] &gt;</span><textarea ref={promptRef} value={draft} onChange={event => { if (suppressNextPromptInputRef.current) { suppressNextPromptInputRef.current = false; return; } setDraft(event.target.value); }} onKeyDown={onPromptKeyDown} placeholder={isBusy ? "Transformation in progress…" : "Paste or type text to transform"} disabled={isBusy} aria-label={`Terminal input for ${MODE_META[activeMode].label} mode`} rows={1} /><button className="send-button" onClick={() => void submit()} disabled={isBusy || !draft.trim()} aria-label="Submit text"><SendHorizontal size={16} /></button></div></div>
      </section> : <div className="closed-terminal"><TerminalSquare size={30} /><h1>{terminal.minimized ? "Terminal minimized" : "Terminal closed"}</h1><p>Your Grammatical session is preserved on this desktop.</p><button onClick={() => setTerminal(current => ({ ...current, open: true, minimized: false }))}><AppWindow size={16} /> Open Terminal</button></div>}

      <nav className="dock" aria-label="Transformation modes"><button className={terminal.open && !terminal.minimized ? "terminal-dock-control is-open" : "terminal-dock-control"} onClick={() => setTerminal(current => ({ ...current, open: true, minimized: false }))} aria-label="Open Grammatical Terminal"><TerminalSquare size={18} /></button><span className="dock-separator" />{(["proofread", "improve", "natural", "rewrite"] as TransformationMode[]).map(modeButton)}</nav>
      <div className="desktop-caption"><span className="caption-pulse" /> Grammatical · semantic-preserving workspace</div>
    </main>
  );
}
