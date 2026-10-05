# GitHub Metadata and Commit Messages for Grammatical

## Recommended repository description

> Semantic-preserving AI writing workspace in a macOS-inspired terminal. Proofread, improve, naturalize, or rewrite text with Unicode-safe chunking, Markdown/code preservation, tracked review, rich exports, protected glossaries, and production-grade provider safety.

## Short repository descriptions

### Option 1: Product-focused

> A semantic-preserving AI writing workspace with a macOS-inspired terminal and four transformation modes.

### Option 2: Developer-focused

> A TypeScript AI writing terminal with structure-aware Markdown/code handling, streaming transforms, review, exports, and provider safety.

### Option 3: Safety-focused

> Human-controlled AI writing transformations with semantic guards, protected terms, tracked review, and source-preserving failure handling.

### Option 4: Concise

> A macOS-inspired terminal for safe, reviewable AI text transformation.

## Suggested repository topics

`ai-writing`, `text-transformation`, `semantic-preservation`, `llm-safety`, `typescript`, `react`, `trpc`, `drizzle-orm`, `mysql`, `unicode`, `markdown`, `developer-tools`, `macos-ui`, `document-review`, `llm-observability`

## Suggested GitHub About-section wording

**Grammatical MacWrite** is a macOS-inspired terminal writing workspace where language models propose transformations and deterministic application logic decides whether those transformations are safe to present. It supports Proofread, Improve, Natural, and Rewrite modes; long-paste processing; Unicode and structure preservation; Markdown and code-aware editing; semantic analysis; protected glossaries; side-by-side review; rich exports; persistent history; and production controls for authentication, quotas, provider resilience, cost protection, and durable privacy-safe telemetry.

## Recommended project tagline

> The model proposes. Grammatical decides. You remain the author.

## Conventional commit-message options

### Product foundation

```text
feat: build macOS-inspired Grammatical terminal workspace
```

```text
feat(ui): add desktop shell, draggable terminal, and mode Dock
```

```text
feat(transform): add Proofread Improve Natural and Rewrite modes
```

```text
feat(terminal): add local commands, transcript state, and keyboard workflows
```

### Streaming and transformation reliability

```text
feat(transform): add typed SSE streaming with semantic validation
```

```text
fix(stream): preserve source and recover cleanly from provider failures
```

```text
feat(provider): add abortable deadlines bounded retries and circuit protection
```

```text
feat(admission): add authenticated quotas concurrency leases and spend guards
```

```text
fix(transform): prevent unsafe candidates from reaching accepted output
```

### Large-paste and Unicode support

```text
feat(paste): add boundary-aware chunking for large documents
```

```text
feat(paste): add sequential block processing and deterministic text downloads
```

```text
fix(unicode): preserve grapheme clusters emoji and meaningful whitespace
```

```text
feat(export): add per-block outputs and combined Download all workflow
```

### Rich editing, history, and exports

```text
feat(editor): add rich output formatting and clipboard workflows
```

```text
feat(history): add searchable transformation sessions and deletion controls
```

```text
feat(export): add Markdown HTML DOCX and plain-text output formats
```

```text
feat(review): add tracked changes with selective accept and reject decisions
```

### Semantic context and document intelligence

```text
feat(semantic): add typed passage context and entity-role inference
```

```text
feat(structure): preserve Markdown GitHub PR content and fenced code
```

```text
feat(comments): add opt-in code-comment-only transformation mode
```

```text
feat(glossary): add protected-term import export and auto-detection
```

```text
feat(review): add finalization gating and provenance-rich change reports
```

```text
feat(markdown): add synchronized raw source and rendered preview
```

### Observability and production readiness

```text
feat(metrics): add durable privacy-safe fleet transformation telemetry
```

```text
feat(operations): add SLO error-budget policy and incident runbook
```

```text
feat(testing): add production AI regression and failure-injection suites
```

```text
perf(validation): add benchmark load soak and release-gate specifications
```

### Documentation

```text
docs: add complete Grammatical product and architecture documentation
```

```text
docs: add GitHub README usage guide and repository metadata
```

```text
docs: document semantic safety privacy boundaries and operations
```

```text
docs: add AI engineering validation and production release gates
```

## Recommended release commit messages

### Release option 1: Complete product release

```text
feat: release Grammatical MacWrite semantic writing workspace
```

**Body:**

```text
- add macOS-inspired terminal workspace with four transformation modes
- preserve Unicode, Markdown, code, URLs, identifiers, and document structure
- add rich editing, history, review, glossary, semantic analysis, and exports
- add authenticated admission, provider safety, durable telemetry, and runbook
- verify full regression, AI validation, TypeScript, and production build suites
```

### Release option 2: Production hardening release

```text
feat: harden Grammatical for guarded production pilot
```

**Body:**

```text
- enforce authenticated transformation access and durable user quotas
- add fleet concurrency leases and provider token-spend reservations
- add abortable deadlines, bounded retries, and provider circuit breaking
- persist privacy-safe fleet telemetry and define SLO operations
- add adversarial AI regression, failure-injection, and release-gate coverage
```

### Release option 3: AI safety and review release

```text
feat: add semantic review and safety-first document transformation
```

**Body:**

```text
- add typed passage context and deterministic semantic guards
- preserve technical document structure and executable code
- add protected-term suggestions and portable glossaries
- add side-by-side accept/reject review and finalization gating
- add provenance-rich JSON and Markdown change reports
```

### Release option 4: Technical-document release

```text
feat: support structure-aware Markdown and code documentation workflows
```

**Body:**

```text
- parse GitHub-style Markdown and protected document regions
- transform eligible prose without mutating code, commands, URLs, or metadata
- add Markdown preview and optional code-comment-only transformation
- preserve document order and export reviewed final content
```

## Commit-message guidance

Use the imperative mood and keep the subject line concise. Prefer one coherent concern per commit when the repository history is intended for collaborative review. When a change spans product, server, schema, tests, and documentation because those parts are inseparable, use a release commit with a body that names the major boundaries.

Avoid commit subjects such as `updates`, `fix stuff`, `final changes`, or `AI work`. They do not communicate intent, scope, or operational impact. For changes involving provider prompts, semantic guards, quotas, migrations, or data handling, explain the safety consequence in the commit body.

## Suggested version tags

```text
v0.1.0-terminal-foundation
v0.2.0-large-paste-and-exports
v0.3.0-unicode-and-semantic-context
v0.4.0-document-review-and-structure
v0.5.0-production-hardening
v1.0.0-guarded-pilot
```
