import { describe, expect, it } from "vitest";
import { escapeXml, placeholderSvg, resolveImageProvider } from "@/lib/images";

describe("resolveImageProvider", () => {
  it("draws with Claude by default, on the same credential that writes the story", () => {
    expect(resolveImageProvider({ hasClaudeCredential: true })).toBe("claude");
  });

  it("honours an explicit IMAGE_PROVIDER over every default", () => {
    const env = { hasClaudeCredential: true, OPENAI_API_KEY: "sk-x" };
    expect(resolveImageProvider({ ...env, IMAGE_PROVIDER: "placeholder" })).toBe("placeholder");
    expect(resolveImageProvider({ ...env, IMAGE_PROVIDER: "openai" })).toBe("openai");
  });

  it("ignores an unknown IMAGE_PROVIDER rather than trusting it", () => {
    expect(resolveImageProvider({ IMAGE_PROVIDER: "midjourney", hasClaudeCredential: true })).toBe(
      "claude",
    );
  });

  it("falls back to a keyed provider, then to placeholder art", () => {
    expect(resolveImageProvider({ hasClaudeCredential: false, OPENAI_API_KEY: "sk-x" })).toBe(
      "openai",
    );
    expect(resolveImageProvider({ hasClaudeCredential: false })).toBe("placeholder");
  });
});

describe("escapeXml", () => {
  it("escapes every markup-significant character", () => {
    expect(escapeXml(`<>&'"`)).toBe("&lt;&gt;&amp;&apos;&quot;");
  });

  it("leaves normal text and emoji alone", () => {
    expect(escapeXml("Ducky 🦆 splash")).toBe("Ducky 🦆 splash");
  });
});

describe("placeholderSvg", () => {
  it("renders the emoji inside a full-size svg", () => {
    const svg = placeholderSvg("🦆", "a duck in a pond");
    expect(svg).toContain("<svg");
    expect(svg).toContain('viewBox="0 0 1024 1024"');
    expect(svg).toContain("🦆");
  });

  it("neutralizes markup injected through the emoji field", () => {
    const svg = placeholderSvg('"><script>', "a duck in a pond");
    expect(svg).not.toContain("<script");
    expect(svg).toContain("&quot;&gt;&lt;scrip");
  });

  it("is deterministic for the same prompt", () => {
    expect(placeholderSvg("🦆", "same seed")).toBe(placeholderSvg("🦆", "same seed"));
  });
});
