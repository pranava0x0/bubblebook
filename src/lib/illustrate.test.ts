import { describe, expect, it } from "vitest";
import { ILLUSTRATION } from "@/lib/constants";
import {
  illustratorSystemPrompt,
  illustratorUserPrompt,
  parseIllustrations,
  sanitizeSvg,
} from "@/lib/illustrate";

const OK_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">' +
  '<circle cx="512" cy="512" r="300" fill="#FFD84D" stroke="#2E2A28" stroke-width="12"/></svg>';

describe("parseIllustrations", () => {
  it("pulls one SVG per page marker", () => {
    const text = `[page 1]\n${OK_SVG}\n[page 2]\n${OK_SVG}`;
    const parsed = parseIllustrations(text);
    expect([...parsed.keys()]).toEqual([1, 2]);
    expect(parsed.get(1)).toBe(OK_SVG);
  });

  it("keeps the page numbers the model was asked for, not positions", () => {
    const parsed = parseIllustrations(`[page 9]\n${OK_SVG}\n[page 12]\n${OK_SVG}`);
    expect([...parsed.keys()]).toEqual([9, 12]);
  });

  it("survives markdown fences and prose between blocks", () => {
    const text = `Sure!\n[page 3]\n\`\`\`svg\n${OK_SVG}\n\`\`\`\nHope you like it.`;
    expect(parseIllustrations(text).get(3)).toBe(OK_SVG);
  });

  it("does not scavenge the next page's SVG for a page that has none", () => {
    const parsed = parseIllustrations(`[page 1]\nsorry, I can't\n[page 2]\n${OK_SVG}`);
    expect(parsed.has(1)).toBe(false);
    expect(parsed.get(2)).toBe(OK_SVG);
  });

  it("returns nothing for a reply with no markers", () => {
    expect(parseIllustrations(OK_SVG).size).toBe(0);
  });
});

describe("sanitizeSvg", () => {
  it("accepts a plain flat-vector drawing", () => {
    expect(sanitizeSvg(OK_SVG)).toBe(OK_SVG);
  });

  it("accepts gradients, which reference their own defs by fragment id", () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"><defs>' +
      '<linearGradient id="sky"><stop offset="0" stop-color="#BEE7FB"/></linearGradient>' +
      '</defs><rect width="1024" height="512" fill="url(#sky)"/></svg>';
    expect(sanitizeSvg(svg)).toBe(svg);
  });

  // Each of these is a way a model-authored SVG could hurt someone once it is
  // served from the public storage bucket.
  const attacks: Array<[string, string]> = [
    ["script element", '<svg viewBox="0 0 1 1"><script>alert(1)</script></svg>'],
    ["event handler", '<svg viewBox="0 0 1 1"><circle onclick="alert(1)" r="1"/></svg>'],
    ["external image", '<svg viewBox="0 0 1 1"><image href="https://evil.test/x.png"/></svg>'],
    ["xlink href", '<svg viewBox="0 0 1 1"><use xlink:href="https://evil.test/x#a"/></svg>'],
    ["foreignObject", '<svg viewBox="0 0 1 1"><foreignObject><b>hi</b></foreignObject></svg>'],
    ["entity declaration", '<!DOCTYPE svg [<!ENTITY a "b">]><svg viewBox="0 0 1 1"></svg>'],
    ["remote url() fill", '<svg viewBox="0 0 1 1"><rect fill="url(https://evil.test/x)"/></svg>'],
    ["javascript: link", '<svg viewBox="0 0 1 1"><a href="javascript:alert(1)"/></svg>'],
    ["data: uri", '<svg viewBox="0 0 1 1"><image src="data:image/png;base64,AAA"/></svg>'],
    ["style element", '<svg viewBox="0 0 1 1"><style>@import url(x)</style></svg>'],
    ["text element", '<svg viewBox="0 0 1 1"><text>no letters allowed</text></svg>'],
  ];

  for (const [name, svg] of attacks) {
    it(`rejects a ${name}`, () => {
      expect(sanitizeSvg(svg)).toBeNull();
    });
  }

  it("rejects markup that isn't a lone svg element", () => {
    expect(sanitizeSvg("here you go: " + OK_SVG)).toBeNull();
    expect(sanitizeSvg("<svg viewBox='0 0 1 1'>")).toBeNull();
  });

  it("rejects an svg with no viewBox", () => {
    expect(sanitizeSvg('<svg xmlns="http://www.w3.org/2000/svg"><circle r="1"/></svg>')).toBeNull();
  });

  it("rejects a runaway drawing", () => {
    const huge =
      '<svg viewBox="0 0 1 1">' +
      '<circle r="1"/>'.repeat(ILLUSTRATION.maxSvgChars) +
      "</svg>";
    expect(sanitizeSvg(huge)).toBeNull();
  });
});

describe("illustrator prompts", () => {
  it("bans text and demands one consistent cast", () => {
    const prompt = illustratorSystemPrompt();
    expect(prompt).toMatch(/NO text, letters, or numbers/);
    expect(prompt).toMatch(/CONSISTENCY/);
    expect(prompt).toContain("viewBox=\"0 0 1024 1024\"");
  });

  it("names the cast and numbers each page it asks for", () => {
    const prompt = illustratorUserPrompt(
      [{ name: "Ducky", look: "a small yellow duck with one red boot" }],
      [{ pageNumber: 5, imagePrompt: "Ducky splashes", emoji: "💦" }],
      "",
    );
    expect(prompt).toContain("Ducky: a small yellow duck with one red boot");
    expect(prompt).toContain("[page 5] Ducky splashes");
  });

  it("omits the cast block when there are no characters", () => {
    const prompt = illustratorUserPrompt(
      [],
      [{ pageNumber: 1, imagePrompt: "a truck", emoji: "🚚" }],
      "",
    );
    expect(prompt).not.toMatch(/cast/i);
  });

  // Batches are drawn by separate calls that never see each other's output, so
  // the sheet is the only thing keeping the same duck the same yellow.
  it("passes the style sheet verbatim into every batch", () => {
    const sheet = "PALETTE: sky #BEE7FB\nDucky: body #FFD84D";
    const prompt = illustratorUserPrompt(
      [{ name: "Ducky", look: "a small yellow duck" }],
      [{ pageNumber: 1, imagePrompt: "Ducky waddles", emoji: "🦆" }],
      sheet,
    );
    expect(prompt).toContain(sheet);
    expect(prompt).toMatch(/no substitutions/i);
  });

  it("omits the style-sheet block when the sheet is missing", () => {
    const prompt = illustratorUserPrompt(
      [{ name: "Ducky", look: "a small yellow duck" }],
      [{ pageNumber: 1, imagePrompt: "Ducky waddles", emoji: "🦆" }],
      "   ",
    );
    expect(prompt).not.toMatch(/STYLE SHEET/);
  });
});
