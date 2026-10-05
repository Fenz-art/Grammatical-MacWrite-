import { describe, expect, it } from "vitest";
import type { TransformInput } from "../shared/transformations";
import { transformEventStream } from "./transformStream";
import { runSemanticGuard } from "./semanticGuard";
import { TransformProviderSafetyError } from "./providerSafety";

const input: TransformInput = {
  requestId: "test-request",
  text: "PostgreSQL may process 10,000 requests.",
  mode: "improve",
  clientRevision: 1,
};

describe("transformEventStream", () => {
  it("emits ordered status, delta, and completion events for an accepted candidate", async () => {
    const events = [];
    for await (const event of transformEventStream(input, undefined, async () => ({ text: input.text, model: "test" }))) events.push(event);
    expect(events.slice(0, 4).map(event => event.type)).toEqual(["accepted", "progress", "progress", "progress"]);
    const deltas = events.filter(event => event.type === "delta");
    expect(deltas.map(event => event.sequence)).toEqual(deltas.map((_, index) => index));
    expect(deltas.map(event => event.text).join("")).toBe(input.text);
    expect(events.at(-1)).toMatchObject({ type: "complete" });
    expect(events.at(-1)).toMatchObject({ type: "complete", result: { intensity: "standard", semanticContext: { sentenceCount: 1 } } });
  });

  it.each(["proofread", "improve", "natural", "rewrite"] as const)("accepts a context-preserving candidate in %s mode", async mode => {
    const modeInput = { ...input, mode, text: "I am Pratyush. I am a software engine." };
    const events = [];
    for await (const event of transformEventStream(modeInput, undefined, async () => ({ text: "I am Pratyush. I am a software engineer.", model: "test" }))) events.push(event);
    expect(events.at(-1)).toMatchObject({ type: "complete", result: { text: "I am Pratyush. I am a software engineer." } });
  });

  it("preserves Unicode and meaningful whitespace through stream assembly", async () => {
    const unicodeInput = { ...input, text: "🚀 café — مرحبًا 世界\\tready" };
    const events = [];
    for await (const event of transformEventStream(unicodeInput, undefined, async () => ({ text: unicodeInput.text, model: "test" }))) events.push(event);
    expect(events.filter(event => event.type === "delta").map(event => event.text).join("")).toBe(unicodeInput.text);
  });

  it("rejects a candidate that changes protected semantic values", async () => {
    const events = [];
    for await (const event of transformEventStream(input, undefined, async () => ({ text: "The database will process 1,000 requests.", model: "test" }))) events.push(event);
    expect(events.at(-1)).toMatchObject({ type: "rejected", fallbackText: input.text });
  });

  it("propagates document context, protected terminology, and explainable semantic-risk evidence through an accepted stream result", async () => {
    const documentInput: TransformInput = {
      ...input,
      text: "GraphQL may process 10,000 requests.",
      protectedTerms: ["GraphQL"],
      documentContext: { documentId: "pr-1", title: "API retry PR", blockIndex: 1, blockCount: 2, totalCharacters: 9200, profileId: "technical" },
    };
    const events = [];
    for await (const event of transformEventStream(documentInput, undefined, async () => ({ text: documentInput.text, model: "test" }))) events.push(event);
    expect(events.at(-1)).toMatchObject({
      type: "complete",
      result: {
        semanticRisks: expect.arrayContaining([
          expect.objectContaining({ title: "Technical profile applied", resolved: true }),
          expect.objectContaining({ title: "Document context carried across 2 blocks", resolved: true }),
          expect.objectContaining({ title: "Protected terminology preserved", protectedValues: ["GraphQL"], resolved: true }),
        ]),
      },
    });
  });

  it("propagates semantic-risk evidence with a retained source when document protected terminology is removed", async () => {
    const documentInput: TransformInput = {
      ...input,
      text: "GraphQL may process 10,000 requests.",
      protectedTerms: ["GraphQL"],
      documentContext: { documentId: "pr-1", blockIndex: 0, blockCount: 1, totalCharacters: 38, profileId: "technical" },
    };
    const events = [];
    for await (const event of transformEventStream(documentInput, undefined, async () => ({ text: "The API may process 10,000 requests.", model: "test" }))) events.push(event);
    expect(events.at(-1)).toMatchObject({
      type: "rejected",
      fallbackText: documentInput.text,
      semanticRisks: expect.arrayContaining([expect.objectContaining({ title: "Protected terminology needs review", severity: "warning", resolved: false })]),
    });
  });

  it("accepts a code-comment-only transformation while preserving fenced executable code", async () => {
    const commentInput: TransformInput = {
      ...input,
      text: "```ts\n// improve retry copy\nconst id = \"MAC-42\";\n```\n",
      codeCommentOnly: true,
    };
    const candidate = "```ts\n// Improve the retry flow\nconst id = \"MAC-42\";\n```\n";
    const validation = runSemanticGuard(commentInput.text, candidate, [], undefined, true);
    expect(validation).toMatchObject({ accepted: true });
    const events = [];
    for await (const event of transformEventStream(commentInput, undefined, async () => ({ text: candidate, model: "test" }))) events.push(event);
    expect(events.at(-1)).toMatchObject({
      type: "complete",
      result: {
        text: candidate,
        semanticRisks: expect.arrayContaining([expect.objectContaining({ title: "Document structure preserved", resolved: true })]),
      },
    });
  });

  it("rejects an empty provider candidate with a retryable service error", async () => {
    const events = [];
    for await (const event of transformEventStream(input, undefined, async () => ({ text: "", model: "test" }))) events.push(event);
    expect(events.at(-1)).toMatchObject({ type: "error", code: "SERVICE_UNAVAILABLE", retryable: true });
  });

  it("emits a cancellation event when the request is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const events = [];
    for await (const event of transformEventStream(input, controller.signal, async () => ({ text: input.text, model: "test" }))) events.push(event);
    expect(events.at(-1)).toMatchObject({ type: "error", code: "CANCELLED", retryable: false });
  });

  it("classifies provider failure as retryable while preserving the request identity", async () => {
    const events = [];
    for await (const event of transformEventStream(input, undefined, async () => {
      throw new Error("upstream timeout");
    })) events.push(event);
    expect(events.at(-1)).toEqual({
      type: "error",
      requestId: input.requestId,
      code: "SERVICE_UNAVAILABLE",
      retryable: true,
    });
  });

  it("reports missing provider credentials as a non-retryable configuration error", async () => {
    const events = [];
    for await (const event of transformEventStream(input, undefined, async () => {
      throw new Error("PROVIDER_NOT_CONFIGURED");
    })) events.push(event);
    expect(events.at(-1)).toEqual({
      type: "error",
      requestId: input.requestId,
      code: "PROVIDER_NOT_CONFIGURED",
      retryable: false,
    });
  });

  it("propagates a provider deadline as a typed retryable outcome while preserving the request identity", async () => {
    const events = [];
    for await (const event of transformEventStream(input, undefined, async () => {
      throw new TransformProviderSafetyError("DEADLINE_EXCEEDED", true, 4_000);
    })) events.push(event);
    expect(events.at(-1)).toEqual({
      type: "error",
      requestId: input.requestId,
      code: "DEADLINE_EXCEEDED",
      retryable: true,
      retryAfterMs: 4_000,
    });
  });

  it("propagates a circuit-open condition without offering an unsafe immediate retry", async () => {
    const events = [];
    for await (const event of transformEventStream(input, undefined, async () => {
      throw new TransformProviderSafetyError("PROVIDER_CIRCUIT_OPEN", false, 60_000);
    })) events.push(event);
    expect(events.at(-1)).toMatchObject({ type: "error", code: "PROVIDER_CIRCUIT_OPEN", retryable: false, retryAfterMs: 60_000 });
  });
});
