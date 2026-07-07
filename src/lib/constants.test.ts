import { describe, expect, it } from "vitest";
import { STORY_LIMITS, STORY_MODEL, THEMES, TILE_COLORS } from "@/lib/constants";

describe("THEMES", () => {
  it("every theme is fully filled in", () => {
    for (const theme of THEMES) {
      expect(theme.key.length).toBeGreaterThan(0);
      expect(theme.label.length).toBeGreaterThan(0);
      expect(theme.emoji.length).toBeGreaterThan(0);
      expect(theme.seed.length).toBeGreaterThan(3);
      expect(Object.keys(TILE_COLORS)).toContain(theme.color);
    }
  });

  it("theme keys are unique", () => {
    const keys = THEMES.map((t) => t.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("generation settings", () => {
  it("story limits are coherent", () => {
    expect(STORY_LIMITS.minPages).toBeLessThanOrEqual(STORY_LIMITS.maxPages);
    expect(STORY_LIMITS.minWordsPerPage).toBeLessThanOrEqual(STORY_LIMITS.maxWordsPerPage);
    expect(STORY_LIMITS.maxFriends).toBeGreaterThan(0);
  });

  it("a model is configured", () => {
    expect(STORY_MODEL.length).toBeGreaterThan(0);
  });
});
