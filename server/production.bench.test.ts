import { describe, expect, it } from "vitest";
import { splitPasteBlocks } from "../shared/pasteBlocks";
import { inferPassageSemanticContext } from "../shared/semanticContext";
import { buildTransformMessages } from "./textTransform";
import { runSemanticGuard } from "./semanticGuard";
import { transformEventStream } from "./transformStream";
import type { TransformInput } from "../shared/transformations";

const corpus = [
  "I am Pratyush. I am a software engine. The AI model reads 🚀 café — مرحبًا 世界.\n",
  "The server sends a data stream. PostgreSQL may process 10,000 requests, but it must not drop URLs https://example.com.\n",
].join("").repeat(20);

function elapsed(task: () => void): number {
  const start = performance.now();
  task();
  return performance.now() - start;
}

async function elapsedAsync(task: () => Promise<void>): Promise<number> {
  const start = performance.now();
  await task();
  return performance.now() - start;
}

describe("production semantic benchmarks", () => {
  it("keeps typed passage inference below the interactive budget", () => {
    const duration = elapsed(() => {
      for (let index = 0; index < 500; index += 1) inferPassageSemanticContext(corpus);
    });
    expect(duration).toBeLessThan(1_000);
  });

  it("keeps semantic guard throughput bounded on mixed Unicode and factual text", () => {
    const duration = elapsed(() => {
      for (let index = 0; index < 500; index += 1) runSemanticGuard(corpus, corpus);
    });
    // 500 large mixed-Unicode validations are a stress budget, not a single-request SLA.
    expect(duration).toBeLessThan(2_500);
  });

  it("keeps stream assembly bounded for sequential accepted blocks", async () => {
    const duration = await elapsedAsync(async () => {
      for (let index = 0; index < 20; index += 1) {
        const input: TransformInput = { requestId: `bench-${index}`, text: `Block ${index}: ${corpus.slice(0, 500)}`, mode: "rewrite", clientRevision: index };
        const events = [];
        for await (const event of transformEventStream(input, undefined, async () => ({ text: input.text, model: "bench" }))) events.push(event);
        expect(events.at(-1)?.type).toBe("complete");
        expect(events.filter(event => event.type === "delta").map(event => event.text).join("")).toBe(input.text);
      }
    });
    expect(duration).toBeLessThan(1_500);
  });

  it("keeps failure diagnostics deterministic for unavailable candidates", async () => {
    const input: TransformInput = { requestId: "bench-failure", text: "A stable sentence.", mode: "improve", clientRevision: 1 };
    const events = [];
    for await (const event of transformEventStream(input, undefined, async () => { throw new Error("upstream timeout"); })) events.push(event);
    expect(events.at(-1)).toMatchObject({ type: "error", code: "SERVICE_UNAVAILABLE", retryable: true, requestId: input.requestId });
  });

  it("keeps prompt construction and safe chunking linear for large blocks", () => {
    const duration = elapsed(() => {
      for (const mode of ["proofread", "improve", "natural", "rewrite"] as const) {
        buildTransformMessages(corpus, mode);
        splitPasteBlocks(corpus);
      }
    });
    expect(duration).toBeLessThan(500);
  });
});
