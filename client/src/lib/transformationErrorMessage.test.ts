import { describe, expect, it } from "vitest";
import { transformationErrorMessage } from "./transformationErrorMessage";

describe("transformationErrorMessage", () => {
  it("explains network failures without implying provider retries", () => {
    expect(transformationErrorMessage("NETWORK_LOST")).toContain("Connection to Grammatical was interrupted");
    expect(transformationErrorMessage("NETWORK_LOST")).toContain("Your input is preserved");
    expect(transformationErrorMessage("NETWORK_LOST")).not.toContain("automatic retries");
  });

  it("explains service failures without claiming retries always occurred", () => {
    expect(transformationErrorMessage("SERVICE_UNAVAILABLE")).toContain("could not complete this request");
    expect(transformationErrorMessage("SERVICE_UNAVAILABLE")).toContain("Your input is preserved");
    expect(transformationErrorMessage("SERVICE_UNAVAILABLE")).not.toContain("automatic retries");
  });

  it("keeps configuration failures actionable", () => {
    expect(transformationErrorMessage("PROVIDER_NOT_CONFIGURED")).toContain("Configure LLM_API_KEY and LLM_MODEL");
  });
});