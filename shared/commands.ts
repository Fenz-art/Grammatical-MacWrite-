import { isTransformationMode, type TransformationMode } from "./transformations";

export type TerminalCommand =
  | { type: "clear" }
  | { type: "help" }
  | { type: "copy-output" }
  | { type: "mode"; mode: TransformationMode }
  | { type: "invalid-mode"; value: string }
  | { type: "text"; text: string };

export function parseTerminalInput(raw: string): TerminalCommand {
  const text = raw.trim();
  const normalized = text.toLocaleLowerCase();
  if (normalized === "clear") return { type: "clear" };
  if (normalized === "help") return { type: "help" };
  if (normalized === "copy-output") return { type: "copy-output" };
  if (normalized.startsWith("mode ")) {
    const value = normalized.slice(5).trim();
    if (isTransformationMode(value)) return { type: "mode", mode: value };
    return { type: "invalid-mode", value };
  }
  return { type: "text", text: raw };
}
