import { afterEach, describe, expect, it, vi } from "vitest";
import { invokeLLM } from "./llm";

afterEach(() => vi.unstubAllGlobals());

describe("OpenAI-compatible LLM transport", () => {
  it("sends the configured endpoint, model, and provider bearer key", async () => {
    const fetchMock = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) => new Response(
      JSON.stringify({ choices: [{ message: { content: "A polished sentence." } }] }),
      { status: 200, headers: { "content-type": "application/json" } },
    ));
    vi.stubGlobal("fetch", fetchMock);

    const response = await invokeLLM({
      model: "anthropic/claude-sonnet",
      messages: [{ role: "user", content: "A sentence." }],
      maxCompletionTokens: 2_400,
    }, {
      name: "openrouter",
      baseUrl: "https://openrouter.ai/api/v1",
      apiKey: "test-provider-key",
      model: "anthropic/claude-sonnet",
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(new Headers(init?.headers).get("authorization")).toBe("Bearer test-provider-key");
    expect(JSON.parse(String(init?.body))).toMatchObject({ model: "anthropic/claude-sonnet" });
    expect(response.choices[0]?.message.content).toBe("A polished sentence.");
  });

  it("uses DeepSeek's max_tokens field for completion limits", async () => {
    const fetchMock = vi.fn(async () => new Response(
      JSON.stringify({ choices: [{ message: { content: "Result." } }] }),
      { status: 200, headers: { "content-type": "application/json" } },
    ));
    vi.stubGlobal("fetch", fetchMock);

    await invokeLLM({
      model: "deepseek-chat",
      messages: [{ role: "user", content: "A sentence." }],
      maxCompletionTokens: 2_400,
    }, {
      name: "deepseek",
      baseUrl: "https://api.deepseek.com/v1",
      apiKey: "test-provider-key",
      model: "deepseek-chat",
    });

    const [, init] = fetchMock.mock.calls[0] ?? [];
    expect(JSON.parse(String(init?.body))).toMatchObject({ max_tokens: 2_400 });
    expect(JSON.parse(String(init?.body))).not.toHaveProperty("max_completion_tokens");
  });
});