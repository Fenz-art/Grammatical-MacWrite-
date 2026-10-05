import { describe, expect, it } from "vitest";
import { parseTransformStreamFrame, parseTransformStreamPayload, splitTransformStreamFrames, transformStreamUrl } from "../shared/transformStreamTransport";

describe("transform stream transport", () => {
  const event = { json: { type: "complete", requestId: "req-1", result: { text: "Hello", model: "test", intensity: "standard", semanticContext: { sentenceCount: 1, entities: [], relations: [] }, semanticRisks: [], validationStatus: "accepted", checks: [], elapsedMs: 1 } } };

  it("encodes the tRPC subscription input without placing credentials in the URL", () => {
    const url = transformStreamUrl({ requestId: "req-1", text: "Hello", mode: "proofread", clientRevision: 1 });
    expect(url).toContain("/api/trpc/transform.stream?input=");
    expect(url).not.toContain("Authorization");
    expect(url).toContain(encodeURIComponent('"requestId":"req-1"'));
  });

  it("splits complete and partial SSE frames for both LF and CRLF streams", () => {
    const complete = `data: ${JSON.stringify(event)}\r\n\r\n`;
    const partial = `data: ${JSON.stringify({ json: { type: "progress", requestId: "req-1", phase: "transforming" } })}`;
    const split = splitTransformStreamFrames(complete + partial);
    expect(split.frames).toHaveLength(1);
    expect(split.remainder).toBe(partial);
    expect(parseTransformStreamFrame(split.frames[0]!)).toMatchObject({ type: "complete", requestId: "req-1" });
  });

  it("extracts data lines and rejects empty or malformed SSE frames", () => {
    const raw = JSON.stringify({ json: { type: "progress", requestId: "req-1", phase: "analyzing" } });
    expect(parseTransformStreamFrame(`event: message\ndata: ${raw}\n\n`)).toMatchObject({ type: "progress", phase: "analyzing" });
    expect(() => parseTransformStreamFrame("event: message\n\n")).not.toThrow();
    expect(parseTransformStreamFrame("event: message\n\n")).toBeNull();
    expect(() => parseTransformStreamPayload("not-json")).toThrow();
  });

  it("unwraps tRPC result envelopes and ignores lifecycle envelopes", () => {
    const nested = JSON.stringify({ result: { data: { json: { type: "complete", requestId: "req-1", result: { text: "Hello" } } } } });
    expect(parseTransformStreamFrame(`data: ${nested}\n\n`)).toMatchObject({ type: "complete", requestId: "req-1" });
    expect(parseTransformStreamPayload(JSON.stringify({ result: { type: "started" } }))).toBeNull();
  });
});
