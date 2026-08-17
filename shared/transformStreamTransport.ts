import type { TransformInput, TransformationStreamEvent } from "./transformations";

export function transformStreamUrl(input: TransformInput) {
  const payload = encodeURIComponent(JSON.stringify({ json: input }));
  return `/api/trpc/transform.stream?input=${payload}`;
}

export function parseTransformStreamPayload(raw: string): TransformationStreamEvent {
  const payload = JSON.parse(raw) as { json?: unknown };
  if (!payload.json || typeof payload.json !== "object" || !("type" in payload.json)) {
    throw new Error("Malformed transform stream event.");
  }
  return payload.json as TransformationStreamEvent;
}
