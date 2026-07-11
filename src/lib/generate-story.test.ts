import { describe, expect, it, vi } from "vitest";
import { extractJsonObject } from "@/lib/claude";
import { STORY_LIMITS } from "@/lib/constants";
import { generateFromText, systemPrompt, userPrompt } from "@/lib/generate-story";

// A story that passes storySchema: enough pages, 1-2 sentences each, 1 character.
const PAGES = [
  "Duck goes splash!",
  "Duck hops high. The sun is warm!",
  "Where is Duck's boot?",
  "Duck looks under a leaf.",
  "Splash, splash, splash!",
  "A frog hops by. Hello, frog!",
  "There is the boot!",
  "Duck hugs the frog tight.",
  "Sleepy Duck naps.",
];
const VALID_STORY = JSON.stringify({
  title: "Little Duck",
  pages: PAGES.map((text) => ({ text })),
  characters: [{ name: "Duck", look: "a small yellow duck", emoji: "🦆" }],
});
const INVALID_STORY = '{"title":"x","pages":[],"characters":[]}';

describe("extractJsonObject", () => {
  it("returns bare JSON unchanged", () => {
    const json = '{"title":"Duck"}';
    expect(extractJsonObject(json)).toBe(json);
  });

  it("strips a markdown fence and surrounding prose", () => {
    const text = 'Here you go:\n```json\n{"title":"Duck"}\n```\nEnjoy!';
    expect(extractJsonObject(text)).toBe('{"title":"Duck"}');
  });

  it("handles nested objects and braces inside strings", () => {
    const json = '{"a":{"b":1},"note":"a } brace in a string"}';
    expect(extractJsonObject(`prefix ${json} suffix`)).toBe(json);
  });

  it("handles an escaped quote before a closing brace", () => {
    const json = '{"t":"she said \\"hi\\""}';
    expect(extractJsonObject(json)).toBe(json);
  });

  it("returns null when there is no object", () => {
    expect(extractJsonObject("no json here")).toBeNull();
    expect(extractJsonObject("")).toBeNull();
  });

  it("returns null for an unbalanced object", () => {
    expect(extractJsonObject('{"title":"Duck"')).toBeNull();
  });
});

describe("prompts", () => {
  it("system prompt states the JSON shape and the page/word limits", () => {
    const p = systemPrompt(24);
    expect(p).toContain("JSON object");
    expect(p).toContain(`${STORY_LIMITS.minPages} to ${STORY_LIMITS.maxPages} pages`);
    expect(p).toMatch(/1 or 2 short sentences/);
    expect(p).toContain(`${STORY_LIMITS.maxWordsPerPage} words`);
  });

  it("system prompt keeps the writer to words only — pictures are a later pass", () => {
    const p = systemPrompt(24);
    expect(p).not.toContain("imagePrompt");
    expect(p).toMatch(/illustrator draws the pictures afterward/i);
  });

  it("user prompt asks for the full page count, so the 3-page example isn't copied", () => {
    const p = userPrompt({ description: "a duck", friends: [], ageMonths: 24 });
    expect(p).toContain(`${STORY_LIMITS.minPages} to ${STORY_LIMITS.maxPages} pages`);
  });

  it("user prompt lists friends when present", () => {
    const p = userPrompt({
      description: "a duck",
      friends: [{ name: "Ducky", look: "yellow duck" }],
      ageMonths: 24,
    });
    expect(p).toContain("Ducky");
    expect(p).toContain("yellow duck");
  });

  it("user prompt omits the friends line when there are none", () => {
    const p = userPrompt({ description: "a duck", friends: [], ageMonths: 24 });
    expect(p).not.toContain("familiar friends");
  });
});

describe("authoring brief", () => {
  it("asks for a repeating refrain and reuse of the character's name", () => {
    const p = systemPrompt(24);
    expect(p).toMatch(/refrain/i);
    expect(p).toMatch(/USE THAT NAME/);
  });

  it("asks for a soothing close on sleepy themes", () => {
    expect(systemPrompt(24)).toMatch(/Goodnight|Sleep tight|calming/i);
  });

  it("makes a provided friend the star", () => {
    const p = userPrompt({
      description: "the moon",
      friends: [{ name: "Ducky", look: "yellow duck" }],
      ageMonths: 24,
    });
    expect(p).toMatch(/star/i);
    expect(p).toContain("Ducky");
  });
});

describe("generateFromText retry policy", () => {
  it("returns the parsed story on valid output", async () => {
    const story = await generateFromText(async () => VALID_STORY);
    expect(story.title).toBe("Little Duck");
    expect(story.pages).toHaveLength(PAGES.length);
  });

  it("retries once on invalid output, then succeeds", async () => {
    const getText = vi.fn().mockResolvedValueOnce(INVALID_STORY).mockResolvedValueOnce(VALID_STORY);
    const story = await generateFromText(getText);
    expect(getText).toHaveBeenCalledTimes(2);
    expect(story.title).toBe("Little Duck");
  });

  it("does NOT retry a transport failure — no double-spend", async () => {
    const getText = vi.fn().mockRejectedValue(new Error("claude CLI timed out after 60s"));
    await expect(generateFromText(getText)).rejects.toThrow("timed out");
    expect(getText).toHaveBeenCalledTimes(1);
  });

  it("throws after two invalid outputs", async () => {
    const getText = vi.fn().mockResolvedValue(INVALID_STORY);
    await expect(generateFromText(getText)).rejects.toBeTruthy();
    expect(getText).toHaveBeenCalledTimes(2);
  });
});
