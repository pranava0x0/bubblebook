import { describe, expect, it } from "vitest";
import { ILLUSTRATION } from "@/lib/constants";
import {
  artDirectorUserPrompt,
  derivePlan,
  illustratorSystemPrompt,
  illustratorUserPrompt,
  parseIllustrations,
  sanitizeSvg,
  styleSheetFrom,
  type ArtPlan,
  type StoryForArt,
} from "@/lib/illustrate";

const STORY: StoryForArt = {
  title: "Biscuit's Big Wag",
  pages: [{ text: "Biscuit is a happy little dog." }, { text: "Wag, wag, wag!" }],
  characters: [{ name: "Biscuit", look: "a round brown puppy with a red collar", emoji: "🐶" }],
};

const OK_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">' +
  '<circle cx="512" cy="512" r="300" fill="#FFD84D" stroke="#2E2A28" stroke-width="12"/></svg>';

describe("artDirectorUserPrompt", () => {
  it("hands over the title, cast, and every page text in order", () => {
    const prompt = artDirectorUserPrompt(STORY);
    expect(prompt).toContain("Biscuit's Big Wag");
    expect(prompt).toContain("Biscuit: a round brown puppy with a red collar");
    expect(prompt).toContain("1. Biscuit is a happy little dog.");
    expect(prompt).toContain("2. Wag, wag, wag!");
  });
});

describe("derivePlan", () => {
  it("produces a drawable scene and an emoji for every page without a model", () => {
    const plan = derivePlan(STORY);
    expect(plan.pages).toHaveLength(STORY.pages.length);
    expect(plan.pages[0].scene).toContain("Biscuit");
    expect(plan.pages[0].scene).toContain("Biscuit is a happy little dog.");
    expect(plan.pages.every((p) => p.emoji.length > 0)).toBe(true);
    expect(plan.cast[0].name).toBe("Biscuit");
  });

  it("falls back to a book emoji when the lead has none", () => {
    const plan = derivePlan({ ...STORY, characters: [{ name: "Biscuit", look: "a puppy" }] });
    expect(plan.pages[0].emoji).toBe("📖");
  });
});

describe("styleSheetFrom", () => {
  it("serializes the palette and one line per character", () => {
    const plan: ArtPlan = {
      palette: { sky: "#BEE7FB", ground: "#CFE8B8", outline: "#2E2A28" },
      cast: [{ name: "Biscuit", sheet: "body #8B5E3C, collar #D9403A" }],
      pages: [{ page: 1, scene: "Biscuit wags", emoji: "🐶" }],
    };
    const sheet = styleSheetFrom(plan);
    expect(sheet).toContain("PALETTE: sky #BEE7FB, ground #CFE8B8, outline #2E2A28");
    expect(sheet).toContain("Biscuit: body #8B5E3C, collar #D9403A");
  });
});

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

  // Two drawings under one page marker concatenate into a multi-root document:
  // every element is allowed and it starts/ends with svg, but it isn't
  // well-formed XML and won't render via <img>.
  it("rejects two concatenated svg roots", () => {
    expect(sanitizeSvg(OK_SVG + OK_SVG)).toBeNull();
  });

  // A repeated attribute is fatal XML — the browser fails to render the image
  // entirely — but tags and content are otherwise fine, so only a
  // well-formedness check catches it. Observed live: two `stroke=`s on one path.
  it("rejects a duplicate attribute on one element", () => {
    const dup =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">' +
      '<circle cx="512" cy="512" r="300" stroke="#2E2A28" stroke="#111111" fill="#FFD84D"/></svg>';
    expect(sanitizeSvg(dup)).toBeNull();
  });

  it("keeps distinct hyphenated attributes like stroke-width and stroke", () => {
    const ok =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">' +
      '<circle cx="1" cy="1" r="1" stroke="#2E2A28" stroke-width="12" fill="#FFF"/></svg>';
    expect(sanitizeSvg(ok)).toBe(ok);
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
  it("bans text and demands the cast stay consistent", () => {
    const prompt = illustratorSystemPrompt();
    expect(prompt).toMatch(/NO text, letters, or numbers/);
    expect(prompt).toMatch(/CONSISTENCY/);
    expect(prompt).toContain('viewBox="0 0 1024 1024"');
  });

  // Batches are drawn by separate calls that never see each other's output, so
  // the style sheet is the only thing keeping the same dog the same colors.
  it("passes the style sheet and numbers each page it asks for", () => {
    const prompt = illustratorUserPrompt("PALETTE: sky #BEE7FB\nBiscuit: body #8B5E3C", [
      { pageNumber: 5, scene: "Biscuit wags his tail", emoji: "🐶" },
    ]);
    expect(prompt).toContain("PALETTE: sky #BEE7FB");
    expect(prompt).toMatch(/no substitutions/i);
    expect(prompt).toContain("[page 5] Biscuit wags his tail");
  });
});
