import { describe, expect, it } from "vitest";
import { formatPassageSemanticContext, inferPassageSemanticContext } from "../shared/semanticContext";

describe("typed passage semantic context", () => {
  it("infers a human and occupation relation across sentences", () => {
    const context = inferPassageSemanticContext("I am Pratyush. I am a software engine.");
    const pratyush = context.entities.find(entity => entity.name === "Pratyush");
    expect(pratyush?.type).toBe("human");
    expect(pratyush?.roles).toContain("software engineer");
    expect(pratyush?.confidence).toBeGreaterThan(0.5);
    expect(pratyush?.evidence.length).toBeGreaterThan(0);
    expect(context.relations.length).toBeGreaterThan(0);
  });

  it("recognizes typo-tolerant self-introductions without freezing greeting typos as entities", () => {
    const context = inferPassageSemanticContext("Helo I m Pratyush. I am a software engine.");
    expect(context.entities.find(entity => entity.name === "Pratyush")).toMatchObject({ type: "human" });
    expect(context.entities.some(entity => entity.name === "Helo I")).toBe(false);
  });

  it("normalizes a natural-language self-introduction to the person name", () => {
    const context = inferPassageSemanticContext("Hello, I'm Pratyush. I'm a software engineer.");
    expect(context.entities.find(entity => entity.name === "Pratyush")).toMatchObject({ type: "human" });
    expect(context.entities.some(entity => entity.name === "I'm Pratyush")).toBe(false);
  });

  it("distinguishes AI systems, organizations, objects, and data streams", () => {
    const context = inferPassageSemanticContext("OpenAI built an AI model. The server sends a data stream. Acme Inc. runs the pipeline.");
    expect(context.entities.some(entity => entity.type === "ai-system")).toBe(true);
    expect(context.entities.some(entity => entity.type === "object" || entity.type === "data-stream")).toBe(true);
    expect(context.entities.some(entity => entity.type === "organization")).toBe(true);
  });

  it("formats bounded evidence for prompt grounding", () => {
    const formatted = formatPassageSemanticContext(inferPassageSemanticContext("I am Pratyush. I am a software engineer."));
    expect(formatted).toContain("Sentences=2");
    expect(formatted).toContain("confidence=");
    expect(formatted).toContain("Treat this as evidence");
  });
});
