# GLM Engineering Prompt — Build MacWrite Terminal

## How to use this prompt

Provide this prompt to GLM together with the attached **`MACOS_TERMINAL_EDITOR_DESIGN.md`**. The design document is the visual, interaction, product, safety, and acceptance source of truth. This prompt converts that design into a direct engineering mandate.

---

## Prompt to GLM

You are a senior product engineer, interaction designer, and full-stack TypeScript architect. Build a polished, production-ready browser application named **MacWrite Terminal** using the attached `MACOS_TERMINAL_EDITOR_DESIGN.md` as the primary specification.

The result must be a **macOS-inspired desktop text-transformation workspace**. It must feel like a carefully designed desktop session in a browser, not a generic dashboard placed on a gradient background. The application’s core workflow is simple: a writer selects a transformation mode from a macOS-style Dock, enters or pastes text into a draggable Terminal window, presses Enter, observes an exact transformation status line, receives an incrementally rendered text result, can format that result in place, and can copy the latest edited output.

Do not merely produce a static mockup. Build the interaction model, typed backend contract, cancellation, error states, command parser, rich output editor, clipboard behavior, tests, and responsive layout described below. Do not fabricate user reviews, ratings, testimonials, fake integrations, or unrelated application data.

### 1. Source-of-truth and scope rules

Read the design specification before editing code. Treat it as the primary source of truth for visual direction, interaction behavior, information architecture, privacy posture, accessibility, testing, and acceptance criteria. If this prompt and the design specification differ, the following requirements are non-negotiable and take priority:

| Requirement | Mandatory behavior |
| --- | --- |
| Canonical modes | Exactly `proofread`, `improve`, `natural`, and `rewrite`. |
| Prompt prefix | Must always be exactly `[PROOFREAD] >`, `[IMPROVE] >`, `[NATURAL] >`, or `[REWRITE] >`. |
| Processing copy | Must always read exactly `Transforming text in [MODE] mode…` while a transformation is active. |
| Client commands | Must be exactly `clear`, `mode <name>`, `copy-output`, and `help`. |
| Command routing | Commands are parsed fully on the client and must never call the transformation backend. |
| Copy policy | Copy must use the **current edited output**, never a stale raw model result. |
| Architecture | Transformations must use a typed **tRPC subscription/procedure** that exposes incremental server-to-client events. |
| Safety | Never claim semantic guarantees from an LLM alone; protect critical facts and handle validation rejection explicitly. |
| App style | The product is macOS-inspired, not an Apple product or a literal OS clone. Do not use copied Apple artwork or branding. |

Do not build a full operating-system simulation. The desktop, menu bar, Dock, and Terminal are focused product surfaces that support the writing workflow. Do not add fake Finder windows, fake network toggles, fake system notifications, or extra Dock applications unless they directly implement an approved product behavior.

### 2. Required technology approach

Use the existing project stack when one already exists. If you are starting a fresh implementation, use **React, TypeScript, Vite, Express, tRPC, Zod, and a modern rich-text editor with a serializable document model**. Use Tailwind or a similarly tokenized styling system, but do not let utility classes replace deliberate component architecture. Keep transformation credentials and provider calls server-side only.

Use a tRPC client with a split transport: normal queries and mutations through an HTTP batch link, and transformation subscriptions through an HTTP subscription/SSE link. The transformation procedure must be typed end to end, validate its input with Zod, accept cancellation through the request signal, and return ordered event objects.

Use an LLM only from server code. The server must own mode-specific prompts, provider selection, rate controls, input limits, and error normalization. The browser must never receive provider API keys, hidden prompts, or raw provider credentials.

For persistent storage, do not add a database unless it is explicitly required by the existing project. Version 1 may maintain a session-only transcript in client state. If optional local recovery is added, make it opt-in and explain that it stores text locally.

### 3. Required application architecture

Create clear modules with responsibilities similar to the following. Adapt naming to the existing repository, but keep the separation.

```text
client/
  desktop/             # Wallpaper, menu bar, Dock, desktop-level keyboard handling
  terminal/            # Window chrome, transcript, prompt, scroll logic, command parser
  editor/              # Rich output editor, toolbar, selection state, clipboard serializer
  state/               # Session, window geometry, active request, undo/redo, preferences
  lib/                 # Typed tRPC client and browser utilities

server/
  transform/           # Mode policy, provider gateway, semantic safety gate, stream events
  routers/             # Typed tRPC transform subscription
  validation/          # Protected-token and semantic-result checks

shared/
  transformations.ts   # Mode constants, event schemas, shared types
  commands.ts          # Command parse result types and pure parser where practical
```

Use a transcript event model instead of coupling the terminal UI directly to raw API data. At minimum, distinguish system, input, processing, output, and error events. Every output event must reference the source input event and the active mode used to generate it.

Implement a compact session state model that includes terminal window state, active mode, transcript, active request identifier, latest valid output identifier, output editor revisions, and local accessibility preferences. Keep raw source text and current edited output distinct.

### 4. Core user interface to build

Build the following surfaces, matching the design specification closely.

#### Desktop environment

Render a full-viewport, original abstract wallpaper using deep ink, cobalt, violet, coral, and restrained warm highlights. Add a translucent cool menu bar at the top and a frosted Dock at the bottom. The visual should evoke a modern macOS desktop without copying platform wallpaper or icons.

The menu bar must include the product name, useful app-level menus, lightweight status controls, and a local live clock. Do not present fake host-computer controls. Any displayed menu must open a real, keyboard-accessible menu containing relevant actions such as New Session, Clear Session, Copy Output, Export Transcript, Reduce Motion, Help, and keyboard shortcuts.

#### Dock and modes

Put exactly four primary mode applications in the Dock: **Proofread**, **Improve**, **Natural**, and **Rewrite**. Build original icon glyphs. Add a current-mode indicator, accessible label, tooltip, pressed/active state, and contained hover magnification. Clicking an icon changes the active mode immediately. It must update the Dock state, Terminal context, current prompt prefix, accessible label, and next transform request. It must not retroactively alter a previous result.

Use mode colors consistently:

| Mode | Accent | Icon concept |
| --- | --- | --- |
| Proofread | Mint | Checkmark/document baseline |
| Improve | Blue | Ascending line/spark |
| Natural | Coral | Flowing speech curve |
| Rewrite | Violet | Looping arrows/text lines |

#### Draggable Terminal window

Render one dark, translucent, graphite Terminal window with rounded corners, blur, low-contrast borders, and a centered title. Include authentic-looking but browser-appropriate red, yellow, and green traffic-light controls. The red control closes the window to a reopenable Dock state; the yellow control minimizes it to the Dock; the green control toggles maximize/restore. Do not make these visual-only.

The title bar is the only drag handle. Clamp drag coordinates so the title bar remains visible. Preserve original geometry on maximize/restore. Do not trigger drag while selecting text, clicking controls, or operating menus. Provide keyboard-accessible alternatives for close, minimize, maximize, and reopen.

The terminal transcript is one scrollable history. Autoscroll only if the reader is already at the bottom. If the reader scrolls away while new content arrives, show a keyboard-accessible **Jump to latest** action instead of pulling the scroll position.

Use `SF Mono` where locally available, with `JetBrains Mono` and generic monospace fallbacks. Use a system sans serif face for menus, labels, and buttons.

#### Prompt and terminal history

The active prompt must always use the exact uppercase prefix shown in the requirements. Support typing, paste, multiline pasted input, **Enter to submit**, and **Shift+Enter for a line break**. Include a visible Submit action on touch/narrow layouts. After a successful command or transformation, return focus to the prompt unless the user deliberately has focus within an output editor.

When the user submits prose, append the input to terminal history, show a spinner, and immediately show the exact processing line:

```text
Transforming text in [MODE] mode…
```

The active `[MODE]` token must be the uppercase canonical mode label. The processing row must include a Cancel control. Do not use anxious copy such as “please do not close the tab.” If cancelled, leave the original input visible and emit a clear cancellation event.

#### Terminal commands

Implement a pure, tested client-side command parser. Commands activate only when the entire trimmed input matches a command. Prose that happens to include a word such as “clear” must still go to transformation.

| Command | Required behavior |
| --- | --- |
| `clear` | Clears visible transcript and starts a fresh terminal session. Confirm only if an output contains unsaved local edits. |
| `mode <name>` | Switches to a canonical mode, updates Dock and prompt, and prints a brief local confirmation. Invalid names explain valid options. |
| `copy-output` | Copies the latest valid **edited** output and prints the actual copy outcome. |
| `help` | Prints the exact command reference and important shortcuts. |

Commands must make **zero** transformation backend calls. Test that fact at the unit and network integration levels.

### 5. Transformation service and streaming contract

Implement exactly four mode policies:

| Mode | Server-side policy |
| --- | --- |
| Proofread | Correct grammar, spelling, punctuation, capitalization, and obvious mechanics with minimal wording changes. |
| Improve | Improve clarity, flow, concision, and professional polish while preserving factual meaning. |
| Natural | Make writing conversational and fluent without adding facts or changing intended certainty. |
| Rewrite | Rephrase and restructure for readability while preserving names, numbers, terms, negation, modality, dates, and intent. |

The model prompt must return transformed text only. It must prohibit headings, explanations, quotation marks, Markdown fences, unsupported HTML, and invented information. Preserve user input and policies as separately scoped messages. Treat all model output as untrusted data.

Define the typed transform input and output events as a discriminated union. Include at least the following events:

```ts
type TransformInput = {
  requestId: string;
  text: string;
  mode: "proofread" | "improve" | "natural" | "rewrite";
  protectedTerms?: string[];
  clientRevision: number;
};

type TransformEvent =
  | { type: "accepted"; requestId: string; mode: TransformInput["mode"] }
  | { type: "progress"; requestId: string; phase: "analyzing" | "transforming" | "validating" }
  | { type: "delta"; requestId: string; text: string; sequence: number }
  | { type: "complete"; requestId: string; result: TransformResult }
  | { type: "rejected"; requestId: string; reason: string; fallbackText: string }
  | { type: "error"; requestId: string; code: TransformErrorCode; retryable: boolean };
```

Use a tRPC subscription backed by SSE or the project’s supported subscription transport. Emit ordered text chunks. Buffer model deltas into readable segments; do not animate individual characters. If the upstream provider does not support genuine token streaming, emit real analysis/progress events and reveal the resulting response in coherent display chunks. Make this distinction explicit in documentation and metrics rather than falsely claiming token streaming.

On client cancellation, unsubscribe and propagate an abort signal to the server/upstream request whenever supported. The server must clean up the generator. Reject late events for a request that is no longer active.

### 6. Safety and semantic preservation

Build the transformation layer so an LLM is not treated as an unquestioned truth source. The design reference calls for protecting semantic dimensions including entities, claims, numbers, terminology, negation, modality, quantifiers, dates, temporal relations, coreference, and certainty. Implement the best feasible version within the project scope.

At minimum, extract and protect exact numeric values, dates, URLs, code fragments, user-provided protected terms, obvious named entities, and explicit negation/modal terms. Compare source and candidate before completion. If a critical value changes, reject the candidate or return the original with an explicit review status. Do not silently substitute a potentially unsafe result.

If a dedicated semantic engine is available, put it behind a server adapter and treat its result as the authority for `accepted`, `uncertain`, and `rejected` states. If it is not available, use conservative deterministic checks and label the validation state accurately as limited rather than guaranteed.

Never expose full prompts or raw input/output in analytics. Store provider credentials only on the server. Enforce character limits, request-rate limits, concurrency limits, and timeouts.

### 7. Rich output editor and formatting behavior

Render every successful result inside a self-contained rich output box within terminal history. Use a production-quality document model that can serialize to a safe rich representation and a plain-text projection. Avoid relying on deprecated document commands or direct HTML string mutation as the primary editing model.

The output toolbar must provide the following capabilities:

| Group | Required controls |
| --- | --- |
| Emphasis | Bold, Italic, Underline |
| Typography | Font family and discrete font-size selector: 12, 14, 16, 18, 20, 24, 28 px |
| Color | Text color and highlight color with an accessible predefined palette and custom picker |
| Clipboard | Copy selection and Copy All |
| Editing | Undo, Redo, Clear Formatting |

Toolbar actions apply to the current selection. When the selection is collapsed, they establish the typing style for text entered next. Toolbar interactions must preserve selection where technically possible. Every control must be reachable by keyboard and have an accessible name and tooltip.

Maintain both a canonical rich document and derived plain text. `copy-output` and Copy All must serialize the **current** rich document, including modifications made after the LLM response. When browser support permits, copy sanitized `text/html` and `text/plain`. When rich clipboard write fails, write plain text. When all programmatic copy attempts fail, select the output and explain the native shortcut fallback. Never overwrite the user’s clipboard automatically when a transformation completes.

### 8. Visual and interaction quality bar

Follow the visual system in the design document. Key requirements are:

- Use the specified deep desktop palette and graphite translucent terminal surfaces. The terminal remains the highest-contrast readable surface.
- Use broad, soft shadows and low-contrast borders; avoid dashboard card grids, hard outlines, loud neon glows, or generic SaaS empty states.
- Support original Dock hover magnification with a subtle active indicator dot. Hover must never change the mode; click/keyboard activation does.
- Use short, purposeful motion: 140–220 ms for Dock and window actions. Keyboard actions are instant. Respect `prefers-reduced-motion`.
- Make the desktop responsive. On narrow screens, make the terminal near-fullscreen; keep a safe-area-aware Dock; collapse/wrap the formatting toolbar without hiding functions.
- At 200% browser zoom, all actions remain reachable and readable. Use visible focus rings and high-contrast text.

### 9. Accessibility requirements

Do not treat macOS visual styling as an excuse for inaccessible web UI. Use semantic buttons, keyboard-operable menus, correct focus management, accessible dialogs, and visible focus states.

Use concise live-region announcements for: mode changed, transform started, output ready, copy success/failure, cancellation, and errors. Do **not** announce every streaming delta. Provide keyboard alternatives for every pointer-dependent action, including Dock mode selection, window controls, drag-related layout actions, toolbar formatting, copy, and Jump to latest.

Honor `prefers-reduced-motion` and provide a visible Reduce Motion preference. Ensure the output editor’s formatting state is understandable to assistive technologies without excessive verbosity.

### 10. Error, loading, and cancellation states

Implement and test explicit terminal events for input too long, rate-limiting, network loss, cancellation, validation rejection, and service unavailability. Preserve original input in every failure case. Provide retry only when appropriate.

Use these intent-aligned messages or a meaningfully equivalent implementation:

| State | Required terminal response |
| --- | --- |
| Input too long | `That input is too long for one transformation. Split it into smaller sections.` |
| Rate limited | `The transformation service is busy. Try again in a moment.` |
| Network lost | `Connection interrupted. Your input is preserved.` |
| Cancelled | `Transformation cancelled. Your input is preserved above.` |
| Validation rejection | `The result was held because meaning may have shifted.` |
| Service unavailable | `Transformation is temporarily unavailable.` |

### 11. Test and verification requirements

Write and run meaningful tests before declaring the work complete. Do not use screenshots as a substitute for behavior tests.

At minimum, include tests for all of the following:

| Test area | Required coverage |
| --- | --- |
| Mode constants | Four canonical modes and exact uppercase labels. |
| Prompt rendering | Exact `[MODE] >` prefixes and exact processing status text. |
| Command parser | Valid commands, invalid mode, case normalization, and prose non-command cases. |
| Command isolation | Commands do not call the transformation backend. |
| Mode policy | Correct prompt policy routing for each transformation mode. |
| Event stream | Ordered chunks, completion, late-event protection, error, and cancellation. |
| Safety checks | Numbers, dates, protected terms, URLs, code spans, negation/modal preservation failures. |
| Rich editor | Selection formatting, current-document copy, undo/redo, clear formatting. |
| Clipboard | Rich success, plain fallback, and permission failure fallback. |
| UI accessibility | Keyboard focus, dialog/menu behavior, live-region announcements, reduced motion. |
| Responsive UI | Desktop layout, narrow layout, and 200% zoom resilience. |

Run TypeScript checks, linting, unit tests, and end-to-end tests supported by the environment. Manually verify the following full journey: select Rewrite → paste multi-paragraph text → press Enter → observe exact active status → cancel once → retry → see streamed output → select part of output → bold and highlight it → run `copy-output` → paste elsewhere and confirm that current edited content is copied.

### 12. Definition of done

You are finished only when all items below are true:

1. The product looks and feels like a refined, macOS-inspired text workspace, not a static demo.
2. The Dock switches modes immediately and every prompt uses the exact required format.
3. The terminal is draggable, minimizable, maximizable, closable, reopenable, scrollable, and keyboard accessible.
4. Prose submissions trigger the exact processing status line and a cancellable typed streaming path.
5. The four terminal commands work locally and never call the transformation API.
6. The output editor supports bold, italic, underline, font family, font size, text color, highlight color, undo/redo, native selection, Copy All, and `copy-output`.
7. Copying always uses the post-edit output state and has rich/plain/fallback behavior.
8. The app protects critical values and exposes validation rejection honestly.
9. Keyboard, reduced-motion, focus, and screen-reader requirements are implemented and verified.
10. Tests and static checks pass, implementation decisions are documented, and no secrets, fake reviews, copied Apple artwork, or placeholder behaviors remain.

Before you finish, summarize the architecture, list all files added or changed, report test results, note any provider-streaming limitation honestly, and identify any deferred work. Do not publish, deploy, or request real user credentials unless explicitly instructed.
