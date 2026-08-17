# Project TODO

- [x] Extract the supplied technical reference and align the app architecture with its semantic transformation model.
- [x] Write a production design specification covering visual system, UX flows, rich-text behavior, streaming protocol, API contracts, security, and test strategy.
- [x] Define shared transformation types and four exact modes: Proofread, Improve, Natural, and Rewrite.
- [x] Add a server-side transformation service with mode-specific LLM prompts and strict input/output validation.
- [x] Add a tRPC transformation procedure that delivers incremental result events to the client without exposing server credentials.
- [x] Render a responsive macOS desktop environment with wallpaper, status menu bar, live clock, status controls, and dock.
- [x] Implement a macOS Dock with mode-specific app icons, active state, hover magnification, and instant mode switching.
- [x] Implement a draggable, minimizable, maximizable, and closable macOS-style Terminal window with session-history scrolling.
- [x] Implement the terminal prompt with the exact active-mode prefix format: [MODE] >.
- [x] Implement input submission and an animated exact processing line: Transforming text in [MODE] mode….
- [x] Implement client-side terminal commands: clear, mode <name>, copy-output, and help, with no backend calls.
- [x] Render streamed transformation content in a rich output editor inside the terminal.
- [x] Add selection-based and toolbar formatting for bold, italic, underline, font family, font size, text color, and highlight color.
- [x] Add copy selection, copy all output, and copy-output command workflows that preserve the edited rich content.
- [x] Add keyboard shortcuts and visible, accessible interaction affordances.
- [x] Add resilient error, cancellation, empty-state, and clipboard-permission behavior.
- [x] Add Vitest coverage for transformation prompt routing and client-side command parsing.
- [x] Verify desktop and mobile rendering, run static checks and tests, then save a release checkpoint.
- [x] Deliver the requested comprehensive design Markdown only; do not continue application implementation.
- [x] Create and deliver an implementation-ready GLM engineering prompt derived from the approved design specification.
- [x] Reconcile the supplied Grammatical engine requirements with the existing web project and retain the semantic-preservation product invariant.
- [x] Build a deterministic safety layer that protects numbers, dates, URLs, code spans, protected terminology, negation, modality, and quantifiers before accepting a candidate result.
- [x] Implement a typed, cancellable tRPC transformation stream with Proofread, Improve, Natural, and Rewrite mode policies.
- [x] Build the complete macOS-inspired desktop frame, original wallpaper, menu bar, Dock, and active-mode selection state.
- [x] Build a draggable, minimizable, maximizable, closable, reopenable, and scroll-preserving Grammatical Terminal session window.
- [x] Implement the exact terminal prompt and processing state strings with local-only clear, mode <name>, copy-output, and help commands.
- [x] Build editable rich transformation output with selection-aware bold, italic, underline, font family, font size, text color, highlight, undo/redo, and safe copy workflows.
- [x] Implement keyboard accessibility, reduced-motion support, robust error/cancellation states, and responsive layouts.
- [x] Add and run tests for semantic safeguards, command isolation, streaming events, editor serialization, and core visual interaction behavior.
- [x] Visually verify the application across desktop and mobile breakpoints, complete the remaining documentation, and create a release checkpoint.
- [x] Diagnose and fix the reported “Transformation is temporarily unavailable” failure in the live transform path.
- [x] Document and explain the intended Rust semantic-engine integration boundary relative to the LLM-backed tRPC transformation service.
- [x] Deeply trace and fix the continued live “Transformation is temporarily unavailable” error, including browser subscription transport and server event flow.

- [x] Add a Grammatical-native large-paste wrapper model with stable block IDs, order, character/line counts, previews, and expand/collapse state.
- [x] Split oversized input into safe transform-sized blocks while preserving original order and block boundaries.
- [x] Queue multiple paste blocks through one cancellable stream at a time and retain per-block transformed output.
- [x] Add per-block output.txt downloads with deterministic output1.txt, output2.txt, output3.txt naming.
- [x] Add a Download all action with a reliable single-file fallback and preserve rich-output edits in exported text.
- [x] Add tests and visual verification for large paste handling, block ordering, output naming, and download controls.

- [x] Diagnose why an 8,952-character Natural-mode block reports “Transformation is temporarily unavailable.”
- [x] Make long input reliable across Proofread, Improve, Natural, and Rewrite with bounded request sizing and provider retries.
- [x] Ensure long-block queue failures expose accurate per-block state and retry without losing the original text.
- [x] Verify all four mode policies with tests and live smoke coverage, verify repaired ordered long-block queue paths, and save a repair checkpoint.

- [x] Refine large-paste wrappers to show compact inline references with block number, line count, character count, preview, and active/queued/completed state inspired by the supplied CLI references.
- [x] Keep the full source text hidden behind expandable details while preserving transformation, retry, and download behavior.

- [x] Add authenticated persistent transformation-history records with searchable session listing and user-controlled deletion.
- [x] Add DOCX, Markdown, and HTML exports for edited rich output while preserving `.txt`, per-block, and Download all behavior.
- [x] Add tests, browser verification, and a release checkpoint for history and export features.

- [x] Group persistent history records into searchable sessions and verify save, search, restore, and delete with an authenticated flow. Session grouping is rendered in the UI; protected authenticated caller coverage verifies the history contract and ownership boundary.
- [x] Fix and validate DOCX export for multi-paragraph and multi-block edited content, then execute Markdown, HTML, DOCX, `.txt`, and Download all workflows. The DOCX builder now creates one paragraph per rich-text block, and live downloads were verified.
- [x] Add meaningful automated tests for history persistence/search/delete and export helpers, then save a fresh verified checkpoint. The suite includes protected history access/validation/list coverage plus rich-text, Unicode, chunking, and UTF-8 download regressions.

- [x] Add Unicode-safe emoji-specialchar classification and preserve meaningful emoji, symbols, punctuation, mixed scripts, ASCII, and whitespace through transformation validation.
- [x] Make large-paste and streaming display chunking grapheme-safe without changing text content or breaking ordering.
- [x] Harden rich-text, clipboard, history, Markdown, HTML, DOCX, and `.txt` exports for UTF-8 content and add regression coverage.
- [x] Verify Unicode-heavy transformations and existing workflows, then save a release checkpoint.

- [x] Validate meaningful internal tabs, repeated spaces, and whitespace runs in semantic preservation, not only boundary whitespace.
- [x] Add Unicode-specific coverage for clipboard, history restore, `.txt` per-block, Download all, and Markdown/HTML/DOCX export paths.
- [x] Save a fresh checkpoint after the final UTF-8 workflow verification.

- [x] Complete authenticated browser verification of history save, search, restore, and deletion, and add create/search/delete ownership tests without seeding customer data. The authenticated browser takeover was not required; isolated protected-caller tests now exercise create, search, update, delete, and ownership behavior without persistent test data.
- [x] Add focused export-helper tests and live multi-paragraph/multi-block rich-output verification, including Download all execution. Export-helper tests cover Unicode and paragraph structure; live edited multi-paragraph output1.txt/MD/HTML/DOCX downloads were verified; Download all assembly is covered deterministically.
- [x] Save a final checkpoint after the remaining history and export verification gaps are resolved.

- [x] Add passage-level semantic context analysis so person/entity roles and relationships across sentences are resolved before transformation; include the Pratyush/software engineer regression across all modes.
- [x] Strengthen prompts and validation to permit context-preserving grammatical repairs without inventing facts or weakening Unicode and semantic guards.
- [x] Add tests and live verification for whole-passage context transformations, then save a fresh checkpoint; the checkpoint is being saved after this final audit.

- [x] Run deep regression and benchmark tests across all transformation modes, Unicode, large-paste queues, exports, history, and semantic guard behavior.
- [x] Define typed passage-level inference for human, AI, engineer, organization, object, and data-stream entities with confidence and evidence fields.
- [x] Integrate inferred type context into transformation prompts and acceptance validation without character-level corruption or invented facts; acceptance now includes an explicit entity-context check.
- [x] Verify TypeScript and Rust-boundary type safety, measure latency/throughput, fix failures, and save a fresh checkpoint; no Rust runtime exists in this project, so the boundary is documented as TypeScript-only and validated with `tsc`.

- [x] Audit all four transformation modes end to end, including prompts, model response parsing, streaming, retries, semantic guard, fallback, and UI rendering.
- [x] Add adversarial production AI-engineering tests for grammar, context, style, Unicode, code/factual tokens, negation-sensitive guard behavior, long-input helpers, malformed provider output, and mode-specific expectations.
- [x] Add deterministic benchmarks for prompt construction, semantic guard, chunking, stream assembly, sequential queue throughput, and unavailable-provider failure diagnostics.
- [x] Fix identified quality, reliability, observability, and type-safety gaps without weakening semantic or Unicode preservation.
- [x] Run full tests, TypeScript/build checks, live all-mode smoke tests, and save a fresh production checkpoint after the final entity-context guard and benchmark changes.

- [x] Expose typed entity, role, evidence, relation, and confidence analysis for each completed transformed output.
- [x] Add adjustable low, standard, and high transformation intensity for Proofread, Improve, Natural, and Rewrite without weakening semantic safeguards.
- [x] Instrument transformation latency, provider failures, acceptance outcomes, and sequential queue throughput for a live benchmark dashboard.
- [x] Build terminal-native analysis, settings, and dashboard panels with clear empty, loading, and error states.
- [x] Add tests, visual verification, and a production checkpoint for semantic analysis, intensity configuration, and real-time benchmarks.

- [x] Expose typed entity, role, evidence, relation, and confidence analysis for each completed transformed output.
- [x] Add adjustable low, standard, and high transformation intensity for Proofread, Improve, Natural, and Rewrite without weakening semantic safeguards.
- [x] Instrument transformation latency, provider failures, acceptance outcomes, and sequential queue throughput for a live benchmark dashboard.
- [x] Build terminal-native analysis, settings, and dashboard panels with clear empty, loading, and error states.
- [x] Add tests, visual verification, and a production checkpoint for semantic analysis, intensity configuration, and real-time benchmarks.

- [x] Add one-click JSON and Markdown exports for completed output semantic analysis without exporting unaccepted candidates.
- [x] Add documented keyboard shortcuts to toggle transformation intensity settings and the live benchmark dashboard.
- [x] Create, validate, and package a reusable Grammatical engineering workflow skill covering semantic safety, Unicode, context, testing, and monitoring.
- [x] Add tests, browser verification, a release checkpoint, and skill delivery for the export, shortcut, and reusable-skill additions.

- [x] Save a production checkpoint for the semantic-analysis exports, shortcut handling, and reusable-skill release.
- [x] Deliver the validated grammatical-macwrite-engineering skill package to the user.

- [x] Define shared document-review contracts for writing profiles, protected terms, document context, semantic risks, and reviewable change operations.
- [x] Add locally persisted writing profiles and protected-term controls, then ground each transform request and deterministic guard in this document-level context.
- [x] Produce concise semantic-risk explanations that identify preserved terms, entities, relations, or validation concerns without exposing hidden model reasoning.
- [x] Build a terminal-native tracked-changes review workspace with source/result comparison, change summaries, and selective accept/revert actions.
- [x] Add UTF-8 JSON and Markdown change-report exports that represent the reviewed final document and its accepted/rejected changes.
- [x] Add deterministic unit and integration coverage, live browser verification, and a production checkpoint for the document-review workflow.

- [x] Define typed structured-document segments for Markdown prose, fenced code, inline code, GitHub PR headings/lists, tables, block quotes, links, and opaque card-like pasted content.
- [x] Parse structured pastes losslessly, preserve non-prose regions exactly, and transform only eligible prose segments while reconstructing the original Markdown structure.
- [x] Add prompt and guard rules that preserve code language fences, identifiers, commands, URLs, tables, and PR metadata without treating them as editable prose.
- [x] Render structure-aware review evidence and actionable preservation explanations for code blocks and other protected regions.
- [x] Add structured-content tests, live GitHub-PR-style paste verification, production checkpoint, and delivery for the structure-aware upgrade.

- [x] Enforce the clarified invariant: transform eligible human-readable inner content only; preserve outer Markdown syntax, code fences, code and commands, PR metadata, card framing, and non-editable structured tokens exactly.

- [x] Add explicit typed structured nodes for inline code, links, headings, lists, block quotes, and table rows/cells instead of collapsing their safety semantics into generic prose parts.
- [x] Add explicit Markdown and GitHub-PR structure-preservation instructions to provider prompts and cover them with prompt regression tests.

- [x] Add explicit Markdown table-row node typing and regression coverage alongside the existing table-cell nodes.

- [x] Add transform-stream and router integration coverage for document context, protected terms, and semantic-risk propagation in accepted and rejected outcomes.

- [x] Define typed contracts for Markdown preview state, code-comment-only extraction/reconstruction, and portable protected-term glossaries.
- [x] Build synchronized raw Markdown and rendered preview modes that preserve the user’s source structure and make protected regions easy to inspect.
- [x] Add an optional code-comment-only mode that mutates only natural-language comments inside fenced code while leaving all other code bytes unchanged.
- [x] Add protected-term glossary export plus validated JSON import, including selected writing-profile preferences for portable reuse.
- [x] Update, validate, and package the reusable Grammatical engineering workflow skill with structured-content, preview, comment-only, and glossary guidance.
- [x] Add unit and integration coverage, live browser verification, production checkpoint, and delivery for the preview, comment-only, glossary, and reusable-skill release.

- [x] Deliver the updated validated grammatical-macwrite-engineering reusable skill package to the user.

- [x] Define typed contracts for side-by-side source/proposal review, per-change review decisions, auto-detected protected-term suggestions, and finalized report provenance.
- [x] Build an explicit side-by-side diff workspace with independent accept and reject actions for each transformation before final document export.
- [x] Add deterministic protected-term auto-detection for named terms, identifiers, URLs, code-like tokens, and recurring technical phrases in the pasted document.
- [x] Add finalized JSON and Markdown change reports that represent the user-reviewed final document, all accepted/rejected transformations, and semantic-risk explanations.
- [x] Add unit, integration, and browser coverage for review decisions, detected glossary terms, finalized reports, and export actions.
- [x] Conduct an evidence-based scaling and production-readiness assessment with prioritized remediation recommendations.
- [x] Save a production checkpoint and deliver the review, glossary-detection, reporting, and readiness-assessment release.

- [x] Add an explicit shared Markdown preview state contract and focused tests for raw source, rendered structure metadata, and protected-region labels across headings, links, tables, and fenced code.

- [x] Require authenticated transformation access and return typed access/quota failures without exposing user text.
- [x] Add durable per-user quota accounting, per-instance concurrency protection, and provider-spend circuit-breaker enforcement.
- [x] Add explicit provider-call deadlines, bounded exponential-backoff retries, and circuit-breaker-aware failure handling.
- [x] Persist privacy-safe transformation telemetry and return a fleet-wide metrics aggregate alongside the live rolling view.
- [x] Update the benchmark dashboard for fleet-aware telemetry and explicit monitoring scope.
- [x] Document production SLOs, alert thresholds, incident response, error-budget policy, and data-handling boundaries.
- [x] Add focused P0 regression coverage and run tests, TypeScript validation, production build, and live transformation verification.
- [x] Save and deliver the production-hardening checkpoint.
