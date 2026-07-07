import { describe, expect, it } from "vitest";
import { escapeXml, placeholderSvg } from "@/lib/images";

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
