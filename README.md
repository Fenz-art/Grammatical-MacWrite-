# Grammatical — semantic writing terminal workspace

Grammatical is a macOS-inspired terminal for evidence-preserving text transformation. You paste text, choose one of four **transformation modes**, and the workspace proposes an edited result while protecting the facts, names, numbers, URLs, code, structure, and Unicode that must not change.

> The model proposes; Grammatical decides.

## Features

- **Four transformation modes** in a macOS-style Dock: `Proofread`, `Improve`, `Natural`, and `Rewrite`, each with an intensity preset.
- **Draggable terminal window** with minimize, maximize, and Dock navigation; a dark, focused workspace.
- **Terminal transcript** with local commands (`clear`, `help`, `copy-output`, `mode <mode>`) and keyboard-driven workflows.
- **Typed SSE streaming** with progress, delta, completion, rejection, and typed error events.
- **Semantic safety guards** that reject candidates that drop or alter numbers, dates, URLs, code, negation, modality, quantifiers, protected terms, entities, meaningful whitespace, or document structure. The source is always recoverable.
- **Large-paste support** that chunks at paragraph, line, and sentence boundaries and processes blocks sequentially with per-block downloads and a combined **Download all**.
- **Unicode-safe** grapheme handling that preserves emoji, mixed scripts, symbols, and meaningful whitespace.
- **Structure-aware Markdown** that keeps GitHub PR content, fenced code, commands, table framing, and executable code byte-for-byte, with an optional **code-comment-only** mode and a synchronized rendered preview.
- **Rich editing** with clipboard workflows; **spelling/format exports** as Markdown, HTML, plain text, and DOCX.
- **Searchable transformation history** (account-scoped) with deletion controls.
- **Tracked-changes review** with selective accept/reject, finalization gating, and provenance-rich JSON/Markdown change reports.
- **Protected-term glossary** with import, export, and auto-detection.
- **Privacy-safe fleet telemetry** with an authenticated benchmark dashboard, SLO/error-budget policy, and an incident runbook.

## Getting started

```bash
pnpm install        # install dependencies
pnpm dev            # start the development server (Vite + server)
pnpm check          # TypeScript type-check
pnpm test           # run the Vitest suite (server/**/*.test.ts)
pnpm build          # production build (Vite + esbuild server bundle)
pnpm start          # run the production server
pnpm format         # format with Prettier
```

A `DATABASE_URL` (MySQL) enables persistent history, quotas, provider safety, and fleet telemetry. Authentication uses Manus OAuth; transformation and fleet-telemetry routes require an authenticated session.

## Local commands

| Command | Effect |
| --- | --- |
| `clear` | Clear the terminal transcript |
| `help` | Show this command reference |
| `copy-output` | Copy the latest accepted output |
| `mode proofread` / `improve` / `natural` / `rewrite` | Switch transformation mode |
| *(anything else)* | Treated as text to transform |

## Transformation modes

| Mode | Intent |
| --- | --- |
| `PROOFREAD` | Minimal mechanical correctness fixes: grammar, spelling, punctuation, agreement |
| `IMPROVE` | Clarity, flow, concision, and professional polish while preserving facts |
| `NATURAL` | Natural, fluent, conversational prose without adding facts |
| `REWRITE` | Stronger structure and readability while preserving facts, identity, and intent |

## Documentation

- `server/RUNBOOK.md` — SLOs, error budget, and incident runbook
- `production-readiness-assessment.md` — production and scaling readiness
- `MACOS_TERMINAL_EDITOR_DESIGN.md` — product and design specification
- `verification-notes.md` — release verification evidence

## License

MIT