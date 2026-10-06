import type { TransformInput, TransformationStreamEvent } from "./transformations";

export function transformStreamUrl(input: TransformInput) {
  const payload = encodeURIComponent(JSON.stringify({ json: input }));
  return `/api/trpc/transform.stream?input=${payload}`;
}

export function splitTransformStreamFrames(buffer: string): { frames: string[]; remainder: string } {
  const frames = buffer.split(/\r?\n\r?\n/);
  return { frames: frames.slice(0, -1), remainder: frames.at(-1) ?? "" };
}

function isTransformationEvent(value: unknown): value is TransformationStreamEvent {
  return Boolean(value && typeof value === "object" && "type" in value && typeof (value as { type?: unknown }).type === "string");
}

function findTransformationEvent(payload: unknown): TransformationStreamEvent | null {
  if (isTransformationEvent(payload)) return payload;
  if (!payload || typeof payload !== "object") return null;
  const envelope = payload as { json?: unknown; result?: { data?: unknown; type?: string } };
  const nested = [
    envelope.json,
    envelope.result?.data,
    envelope.result && typeof envelope.result.data === "object" && envelope.result.data !== null
      ? (envelope.result.data as { json?: unknown }).json
      : undefined,
  ];
  for (const candidate of nested) {
    const event = findTransformationEvent(candidate);
    if (event) return event;
  }
  return null;
}

export function parseTransformStreamFrame(frame: string): TransformationStreamEvent | null {
  const lines = frame.split(/\r?\n/);
  const eventName = lines.find(line => line.startsWith("event:"))?.slice(6).trim();
  if (eventName === "connected" || eventName === "return") return null;
  const data = lines.filter(line => line.startsWith("data:")).map(line => line.slice(5).trimStart()).join("\n");
  if (!data) return null;
  return parseTransformStreamPayload(data);
}

export function parseTransformStreamPayload(raw: string): TransformationStreamEvent | null {
  const payload = JSON.parse(raw) as unknown;
  const event = findTransformationEvent(payload);
  if (event) return event;
  // tRPC emits started/stopped lifecycle envelopes that carry no application event.
  if (payload && typeof payload === "object" && "result" in payload) return null;
  throw new Error("Malformed transform stream event.");
}
