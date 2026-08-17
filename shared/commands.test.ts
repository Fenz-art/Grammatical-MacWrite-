import { describe, expect, it } from "vitest";
import { parseTerminalInput } from "./commands";

describe("parseTerminalInput", () => {
  it("parses only exact local commands", () => {
    expect(parseTerminalInput(" clear ")).toEqual({ type: "clear" });
    expect(parseTerminalInput("COPY-OUTPUT")).toEqual({ type: "copy-output" });
    expect(parseTerminalInput("mode Natural")).toEqual({ type: "mode", mode: "natural" });
  });

  it("leaves natural prose untouched", () => {
    expect(parseTerminalInput("Please clear the meeting notes.")).toEqual({
      type: "text",
      text: "Please clear the meeting notes.",
    });
  });

  it("reports an invalid mode without calling a transform", () => {
    expect(parseTerminalInput("mode polish")).toEqual({ type: "invalid-mode", value: "polish" });
  });
});
