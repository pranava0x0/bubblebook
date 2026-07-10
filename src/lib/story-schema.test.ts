import { describe, expect, it } from "vitest";
import { STORY_LIMITS } from "@/lib/constants";
import {
  countSentences,
  countWords,
  storySchema,
  type GeneratedStory,
} from "@/lib/story-schema";

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

describe("countSentences", () => {
  it("counts terminal punctuation", () => {
    expect(countSentences("Ducky sees water!")).toBe(1);
    expect(countSentences("Ducky sees water. He jumps in!")).toBe(2);
    expect(countSentences("Where is Ducky? There he is!")).toBe(2);
  });

  it("treats a run of terminators as one sentence", () => {
    expect(countSentences("Wow!!")).toBe(1);
    expect(countSentences("Really?!")).toBe(1);
  });

  it("treats an ellipsis as a sentence end, so sleepy closes stay legal", () => {
    expect(countSentences("Goodnight, Ducky…")).toBe(1);
    expect(countSentences("Sleep tight...")).toBe(1);
    expect(countSentences("Where's the ball? There it is…")).toBe(2);
  });

  it("does not count an unterminated fragment", () => {
    expect(countSentences("Ducky sees water")).toBe(0);
    expect(countSentences("")).toBe(0);
  });
});

// Pages carry text only now — the picture is a separate art-direction pass.
function page(text: string) {
  return { text };
}

function validStory(): GeneratedStory {
  return {
    title: "Duck's Big Splash",
    pages: [
      page("Ducky wakes up. The sun is warm!"),
      page("Ducky waddles down to the pond."),
      page("Splash, splash, splash!"),
      page("A little frog hops past. Hello, frog!"),
      page("Where is Ducky's red boot?"),
      page("Ducky looks under a big green leaf."),
      page("There is the boot! Splash, splash, splash!"),
      page("Sleepy Ducky curls up in the soft grass."),
    ],
    characters: [
      { name: "Ducky", look: "a small yellow duck with one red boot", emoji: "🦆" },
    ],
  };
}

describe("storySchema", () => {
  it("accepts a valid story at the page floor", () => {
    const story = validStory();
    expect(story.pages).toHaveLength(STORY_LIMITS.minPages);
    expect(storySchema.safeParse(story).success).toBe(true);
  });

  it("accepts a story at the page ceiling", () => {
    const story = validStory();
    while (story.pages.length < STORY_LIMITS.maxPages) {
      story.pages.push(page("Splash, splash, splash!"));
    }
    expect(storySchema.safeParse(story).success).toBe(true);
  });

  it("rejects too few pages", () => {
    const story = validStory();
    story.pages = story.pages.slice(0, STORY_LIMITS.minPages - 1);
    expect(storySchema.safeParse(story).success).toBe(false);
  });

  it("rejects too many pages", () => {
    const story = validStory();
    story.pages = [...story.pages, ...story.pages];
    expect(storySchema.safeParse(story).success).toBe(false);
  });

  it("rejects a page with too many words", () => {
    const story = validStory();
    const tooLong =
      "The little yellow duck runs very fast all the way down the long green hill in the warm sun today!";
    expect(countWords(tooLong)).toBeGreaterThan(STORY_LIMITS.maxWordsPerPage);
    story.pages[0].text = tooLong;
    expect(storySchema.safeParse(story).success).toBe(false);
  });

  it("rejects a page with one word", () => {
    const story = validStory();
    story.pages[0].text = "Splash!";
    expect(storySchema.safeParse(story).success).toBe(false);
  });

  it("rejects a page of three sentences", () => {
    const story = validStory();
    story.pages[0].text = "Ducky wakes. Sun is up. Time to go!";
    expect(storySchema.safeParse(story).success).toBe(false);
  });

  it("rejects a page that never lands on a full stop", () => {
    const story = validStory();
    story.pages[0].text = "Ducky waddles to the pond";
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

  it("tolerates a null character emoji and normalizes it to empty", () => {
    const story = validStory();
    const raw = { ...story, characters: [{ ...story.characters[0], emoji: null }] };
    const parsed = storySchema.safeParse(raw);
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.characters[0].emoji).toBe("");
  });

  it("tolerates a missing character emoji", () => {
    const story = validStory();
    const raw = { ...story, characters: [{ name: "Ducky", look: "a small yellow duck" }] };
    expect(storySchema.safeParse(raw).success).toBe(true);
  });
});
