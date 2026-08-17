import { describe, expect, it } from "vitest";
import { parseTerminalInput } from "../shared/commands";

describe("terminal command isolation", () => {
  it("recognizes only the four documented client-side commands", () => {
    expect(parseTerminalInput("clear")).toEqual({ type: "clear" });
    expect(parseTerminalInput("help")).toEqual({ type: "help" });
    expect(parseTerminalInput("copy-output")).toEqual({ type: "copy-output" });
    expect(parseTerminalInput("mode rewrite")).toEqual({ type: "mode", mode: "rewrite" });
  });

  it("keeps prose on the transformation path rather than treating it as a command", () => {
    expect(parseTerminalInput("Please improve and clear this paragraph.")).toEqual({
      type: "text",
      text: "Please improve and clear this paragraph.",
    });
  });
});
