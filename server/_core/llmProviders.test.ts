import { describe, expect, it } from "vitest";
import { chooseRoute, resolveLLMProviders, resolveLLMSettings, type ComplexityScore } from "./llmProviders";

const openRouterEnv = {
  LLM_API_KEY: "openrouter-test-key",
  LLM_MODEL: "openai/gpt-4.1",
};

describe("LLM provider configuration", () => {
  it("uses OpenRouter as the default primary endpoint with an explicit model", () => {
    expect(resolveLLMProviders(openRouterEnv)).toEqual([
      {
        name: "openrouter",
        baseUrl: "https://openrouter.ai/api/v1",
        apiKey: "openrouter-test-key",
        model: "openai/gpt-4.1",
      },
    ]);
  });

  it("orders configured Groq and DeepSeek providers as optional fallbacks", () => {
    const providers = resolveLLMProviders({
      ...openRouterEnv,
      GROQ_API_KEY: "groq-test-key",
      GROQ_MODEL: "llama-3.3-70b-versatile",
      DEEPSEEK_API_KEY: "deepseek-test-key",
      DEEPSEEK_MODEL: "deepseek-chat",
    });

    expect(providers.map(provider => provider.name)).toEqual(["openrouter", "groq", "deepseek"]);
    expect(providers.map(provider => provider.baseUrl)).toEqual([
      "https://openrouter.ai/api/v1",
      "https://api.groq.com/openai/v1",
      "https://api.deepseek.com/v1",
    ]);
  });

  it("rejects a missing OpenRouter primary", () => {
    expect(() => resolveLLMProviders({})).toThrow("PROVIDER_NOT_CONFIGURED");
  });

  it("rejects partially configured fallback credentials", () => {
    expect(() => resolveLLMProviders({
      ...openRouterEnv,
      GROQ_API_KEY: "groq-test-key",
    })).toThrow("PROVIDER_NOT_CONFIGURED:GROQ_INCOMPLETE");
  });

  it("rejects non-HTTPS provider endpoints except localhost", () => {
    expect(() => resolveLLMProviders({
      ...openRouterEnv,
      GROQ_API_BASE_URL: "http://api.groq.example/v1",
      GROQ_API_KEY: "groq-test-key",
      GROQ_MODEL: "llama-test",
    })).toThrow("PROVIDER_NOT_CONFIGURED:GROQ_INVALID_URL");
    expect(resolveLLMProviders({
      ...openRouterEnv,
      GROQ_API_BASE_URL: "http://127.0.0.1:11434/v1",
      GROQ_API_KEY: "local-test-key",
      GROQ_MODEL: "local-model",
    })).toHaveLength(2);
  });

  it("routes Qwen to Ling and routes difficult work to GLM with DeepSeek fallback", () => {
    const settings = resolveLLMSettings({
      ...openRouterEnv,
      GROQ_API_KEY: "groq-test-key",
      GROQ_MODEL: "qwen/qwen3.8-27b",
      DEEPSEEK_API_KEY: "deepseek-test-key",
      DEEPSEEK_MODEL: "deepseek-chat",
      OPENROUTER_API_KEY: "openrouter-test-key",
      LLM_SECONDARY_PROVIDER: "openrouter",
      LLM_SECONDARY_MODEL: "inclusionai/ling-3.1-flash",
      LLM_TERTIARY_PROVIDER: "deepseek",
      LLM_QUATERNARY_PROVIDER: "openrouter",
      LLM_QUATERNARY_MODEL: "z-ai/glm-5.3-flash",
    });
    const complexity = (bucket: ComplexityScore["bucket"]): ComplexityScore => ({
      score: 0,
      bucket,
      reasons: [],
      features: {} as ComplexityScore["features"],
    });

    const ordinary = chooseRoute(settings, complexity("small"), { inputTokens: 100, outputTokens: 100 });
    expect([ordinary.provider, ordinary.model, ordinary.tier]).toEqual(["groq", "qwen/qwen3.8-27b", "default"]);
    expect(ordinary.fallbackProviders).toEqual([
      { provider: "openrouter", model: "inclusionai/ling-3.1-flash", tier: "secondary" },
      { provider: "deepseek", model: "deepseek-chat", tier: "tertiary" },
      { provider: "openrouter", model: "z-ai/glm-5.3-flash", tier: "quaternary" },
    ]);

    const routine = chooseRoute(settings, complexity("ordinary"), { inputTokens: 1_200, outputTokens: 1_000 });
    expect([routine.provider, routine.model, routine.tier]).toEqual(["openrouter", "inclusionai/ling-3.1-flash", "secondary"]);

    const contextual = complexity("ordinary");
    contextual.features.crossSentenceReferenceSignals = 3;
    const mediumContext = chooseRoute(settings, contextual, { inputTokens: 1_800, outputTokens: 1_500 });
    expect([mediumContext.provider, mediumContext.model, mediumContext.tier]).toEqual(["deepseek", "deepseek-chat", "tertiary"]);

    const large = chooseRoute(settings, complexity("large"), { inputTokens: 9_000, outputTokens: 2_400 });
    expect([large.provider, large.model, large.tier]).toEqual(["deepseek", "deepseek-chat", "tertiary"]);

    const difficult = chooseRoute(settings, complexity("difficult"), { inputTokens: 20_000, outputTokens: 2_400 });
    expect([difficult.provider, difficult.model, difficult.tier]).toEqual(["openrouter", "z-ai/glm-5.3-flash", "quaternary"]);
    expect(difficult.fallbackProviders).toEqual([
      { provider: "deepseek", model: "deepseek-chat", tier: "tertiary" },
      { provider: "openrouter", model: "inclusionai/ling-3.1-flash", tier: "secondary" },
      { provider: "groq", model: "qwen/qwen3.8-27b", tier: "default" },
    ]);
  });

  it("skips an unconfigured DeepSeek tier while preserving difficult-work fallbacks", () => {
    const settings = resolveLLMSettings({
      ...openRouterEnv,
      GROQ_API_KEY: "groq-test-key",
      GROQ_MODEL: "qwen/qwen3.8-27b",
      OPENROUTER_API_KEY: "openrouter-test-key",
      LLM_SECONDARY_PROVIDER: "openrouter",
      LLM_SECONDARY_MODEL: "inclusionai/ling-3.1-flash",
      LLM_TERTIARY_PROVIDER: "deepseek",
      LLM_TERTIARY_MODEL: "",
      LLM_QUATERNARY_PROVIDER: "openrouter",
      LLM_QUATERNARY_MODEL: "z-ai/glm-5.3-flash",
    });
    const decision = chooseRoute(settings, {
      score: 80,
      bucket: "difficult",
      reasons: [],
      features: {} as ComplexityScore["features"],
    }, { inputTokens: 20_000, outputTokens: 2_400 });

    expect([decision.provider, decision.model, decision.tier]).toEqual(["openrouter", "z-ai/glm-5.3-flash", "quaternary"]);
    expect(decision.fallbackProviders).toEqual([
      { provider: "openrouter", model: "inclusionai/ling-3.1-flash", tier: "secondary" },
      { provider: "groq", model: "qwen/qwen3.8-27b", tier: "default" },
    ]);
  });
});