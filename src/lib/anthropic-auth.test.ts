import { describe, expect, it } from "vitest";
import { chooseCredential, credentialLabel } from "@/lib/anthropic-auth";

describe("chooseCredential", () => {
  it("prefers the subscription token over an API key", () => {
    const choice = chooseCredential({
      CLAUDE_CODE_OAUTH_TOKEN: "sk-ant-oat-abc",
      ANTHROPIC_API_KEY: "sk-ant-api-xyz",
    });
    expect(choice).toEqual({ kind: "subscription", token: "sk-ant-oat-abc" });
  });

  it("falls back to the API key", () => {
    const choice = chooseCredential({ ANTHROPIC_API_KEY: "sk-ant-api-xyz" });
    expect(choice).toEqual({ kind: "api", key: "sk-ant-api-xyz" });
  });

  it("reports none when nothing is set", () => {
    expect(chooseCredential({})).toEqual({ kind: "none" });
  });

  it("treats blank/whitespace values as unset", () => {
    expect(chooseCredential({ CLAUDE_CODE_OAUTH_TOKEN: "   ", ANTHROPIC_API_KEY: "" })).toEqual({
      kind: "none",
    });
  });

  it("trims surrounding whitespace from the chosen value", () => {
    expect(chooseCredential({ CLAUDE_CODE_OAUTH_TOKEN: "  tok  " })).toEqual({
      kind: "subscription",
      token: "tok",
    });
  });
});

describe("credentialLabel", () => {
  it("names each credential kind", () => {
    expect(credentialLabel({ kind: "subscription", token: "t" })).toContain("subscription");
    expect(credentialLabel({ kind: "api", key: "k" })).toContain("API key");
    expect(credentialLabel({ kind: "none" })).toBe("none");
  });
});
