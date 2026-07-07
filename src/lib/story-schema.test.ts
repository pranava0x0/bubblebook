import { describe, expect, it } from "vitest";
import { countWords, storySchema, type GeneratedStory } from "@/lib/story-schema";

describe("countWords", () => {
  it("counts plain words", () => {
    expect(countWords("Big truck goes fast!")).toBe(4);
  });

  it("ignores punctuation-only tokens", () => {
    expect(countWords("Splash, splash, splash!")).toBe(3);
    expect(countWords("— !")).toBe(0);
    expect(countWords("")).toBe(0);
  });

  it("counts hyphenated and apostrophe words once", () => {
    expect(countWords("Choo-choo goes!")).toBe(2);
    expect(countWords("Don't stop now")).toBe(3);
  });
});

function validStory(): GeneratedStory {
  return {
    title: "Duck's Big Splash",
    pages: [
      {
        text: "Ducky sees water!",
        imagePrompt: "A small yellow duck with a red boot looks at a blue pond.",
        emoji: "🦆",
      },
      {
        text: "Splash, splash, splash!",
        imagePrompt: "The small yellow duck with a red boot splashes in the pond.",
        emoji: "💦",
      },
      {
        text: "Ducky sleeps now.",
        imagePrompt: "The small yellow duck with a red boot sleeps on soft grass.",
        emoji: "😴",
      },
    ],
    characters: [
      { name: "Ducky", look: "a small yellow duck with one red boot", emoji: "🦆" },
    ],
  };
}

describe("storySchema", () => {
  it("accepts a valid 3-page story", () => {
    expect(storySchema.safeParse(validStory()).success).toBe(true);
  });

  it("rejects too few pages", () => {
    const story = validStory();
    story.pages = story.pages.slice(0, 2);
    expect(storySchema.safeParse(story).success).toBe(false);
  });

  it("rejects too many pages", () => {
    const story = validStory();
    story.pages = [...story.pages, ...story.pages];
    expect(storySchema.safeParse(story).success).toBe(false);
  });

  it("rejects a page with too many words", () => {
    const story = validStory();
    story.pages[0].text = "The little duck runs very fast today";
    expect(storySchema.safeParse(story).success).toBe(false);
  });

  it("rejects a page with one word", () => {
    const story = validStory();
    story.pages[0].text = "Splash!";
    expect(storySchema.safeParse(story).success).toBe(false);
  });

  it("rejects a five-word title", () => {
    const story = validStory();
    story.title = "The Very Long Duck Story";
    expect(storySchema.safeParse(story).success).toBe(false);
  });

  it("rejects a story with no characters", () => {
    const story = validStory();
    story.characters = [];
    expect(storySchema.safeParse(story).success).toBe(false);
  });
});
