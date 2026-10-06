import { describe, expect, it } from "vitest";
import { parseTransformStreamFrame, parseTransformStreamPayload, transformStreamUrl } from "./transformStreamTransport";

describe("transform stream transport", () => {
  it("builds the tRPC SSE URL using the expected SuperJSON envelope", () => {
    const url = transformStreamUrl({ requestId: "r1", text: "Hello", mode: "proofread", clientRevision: 1 });
    expect(decodeURIComponent(url)).toContain('{"json":{"requestId":"r1"');
  });

  it("extracts the typed event payload sent by the tRPC SSE endpoint", () => {
    expect(parseTransformStreamPayload('{"json":{"type":"delta","requestId":"r1","text":"Hello","sequence":0}}')).toEqual({ type: "delta", requestId: "r1", text: "Hello", sequence: 0 });
  });

  it("ignores tRPC connection and return lifecycle frames", () => {
    expect(parseTransformStreamFrame("event: connected\ndata: {}")).toBeNull();
    expect(parseTransformStreamFrame("event: return\ndata: ")).toBeNull();
  });
});
