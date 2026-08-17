# Grammatical Runtime Boundary

## Current Working Path

MacWrite Terminal now transforms text through the following path:

```text
Terminal UI
  → tRPC SSE subscription
  → TypeScript transform gateway
  → LLM candidate generator
  → deterministic semantic guard
  → accepted, rejected, or error stream event
  → editable terminal output
```

The recent unavailable-result fault was **not caused by a missing Rust API**. The GPT-family model was being sent `max_tokens`, which resulted in a successful HTTP response without generated message content. The server gateway now sends the GPT-compatible `max_completion_tokens` field. A live service probe transformed `helo I am dum` into `Hello, I am dumb.` through the repaired server path.

## Rust Engine Role

The Rust engine is the recommended next architectural layer for Grammatical, but it should not replace the terminal UI or the tRPC gateway. Its purpose is to become the **semantic authority**.

| Responsibility | Current implementation | Rust-engine target |
| --- | --- | --- |
| Candidate generation | LLM mode policies | Deterministic edits plus optional LLM proposals |
| Parser and source spans | Minimal browser/server text handling | Rust document parser with token, sentence, section, code, URL, and formatting spans |
| Semantic checks | Deterministic preservation guard | Semantic IR and validators for claims, entities, relations, coreference, temporal order, and certainty |
| Acceptance decision | Required token-preservation checks | Composite `accepted` / `uncertain` / `rejected` decision from the validator crate |
| Streaming API | tRPC SSE event stream | The same tRPC stream, backed by a Rust service or local/WASM adapter |

> The intended rule remains: **the model proposes; Grammatical decides.**

## Recommended Integration Shape

Do not have the browser call a Rust binary directly. Keep the existing tRPC boundary and introduce a stable server-side adapter.

```text
client tRPC subscription
  → Node/TypeScript orchestration adapter
    → Rust Grammatical API or local sidecar
      → parser → semantic IR → planner → validator
    → optional LLM provider for candidate proposals
  → typed stream events to client
```

The first Rust service endpoint should accept the existing transformation input plus protected terms and return the same semantic result shape used by the web application. This preserves the MacWrite UI contract while allowing the Rust core to evolve independently.

```ts
type RustTransformRequest = {
  text: string;
  mode: "proofread" | "improve" | "natural" | "rewrite";
  protectedTerms?: string[];
};

type RustTransformDecision = {
  text: string;
  decision: "accepted" | "uncertain" | "rejected";
  checks: Array<{ dimension: string; preserved: boolean }>;
  edits: Array<{ start: number; end: number; replacement: string; reason: string }>;
};
```

For local development, the adapter may invoke a Rust process or call a local REST service. For production autoscaling, package the Rust service as a separately deployed API or compile its deterministic core to WebAssembly only when its latency and feature boundaries are appropriate. Keep LLM credentials and provider calls in server infrastructure, never in the browser or Rust parser.
