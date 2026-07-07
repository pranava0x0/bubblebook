import { z } from "zod";
import { STORY_LIMITS } from "@/lib/constants";

// Counts real words: punctuation-only tokens don't count, hyphenated and
// apostrophe words count once ("choo-choo" and "don't" are one word each).
export function countWords(text: string): number {
  return text
    .split(/\s+/)
    .map((token) => token.replace(/[^\p{L}\p{N}]/gu, ""))
    .filter(Boolean).length;
}

// Constraints live in superRefine, not in .min()/.max(): Anthropic structured
// outputs reject JSON-schema string/array constraints (minLength, minItems),
// while zod refinements stay client-side and still gate the parsed object.
const pageSchema = z
  .object({
    text: z
      .string()
      .describe('The page text: 2 to 5 simple words, e.g. "Big truck goes fast!"'),
    imagePrompt: z
      .string()
      .describe(
        "One sentence describing this page's picture. Repeat the character's exact look every time.",
      ),
    emoji: z.string().describe("One emoji that matches this page's picture"),
  })
  .superRefine((page, ctx) => {
    const words = countWords(page.text);
    if (words < STORY_LIMITS.minWordsPerPage || words > STORY_LIMITS.maxWordsPerPage) {
      ctx.addIssue({
        code: "custom",
        path: ["text"],
        message: `page text must be ${STORY_LIMITS.minWordsPerPage}-${STORY_LIMITS.maxWordsPerPage} words, got ${words}`,
      });
    }
    if (page.imagePrompt.trim().length < 8) {
      ctx.addIssue({ code: "custom", path: ["imagePrompt"], message: "image prompt too short" });
    }
    const emoji = page.emoji.trim();
    if (emoji.length === 0 || emoji.length > 8) {
      ctx.addIssue({ code: "custom", path: ["emoji"], message: "need exactly one emoji" });
    }
  });

const characterSchema = z
  .object({
    name: z.string().describe("The character's short, simple name"),
    look: z
      .string()
      .describe(
        "A reusable visual description: colors, size, one cute detail. Used to draw them the same way in future stories.",
      ),
    emoji: z.string().describe("One emoji that best represents this character"),
  })
  .superRefine((character, ctx) => {
    if (character.name.trim().length === 0 || character.name.length > 40) {
      ctx.addIssue({ code: "custom", path: ["name"], message: "name must be 1-40 characters" });
    }
    if (character.look.trim().length < 4 || character.look.length > 240) {
      ctx.addIssue({ code: "custom", path: ["look"], message: "look must be 4-240 characters" });
    }
  });

export const storySchema = z
  .object({
    title: z.string().describe("Story title: 2 to 4 simple words"),
    pages: z.array(pageSchema).describe("3 to 5 pages, in order"),
    characters: z
      .array(characterSchema)
      .describe("The 1-3 characters that appear in the story"),
  })
  .superRefine((story, ctx) => {
    if (story.pages.length < STORY_LIMITS.minPages || story.pages.length > STORY_LIMITS.maxPages) {
      ctx.addIssue({
        code: "custom",
        path: ["pages"],
        message: `story must have ${STORY_LIMITS.minPages}-${STORY_LIMITS.maxPages} pages, got ${story.pages.length}`,
      });
    }
    const titleWords = countWords(story.title);
    if (titleWords < 1 || titleWords > STORY_LIMITS.maxTitleWords) {
      ctx.addIssue({
        code: "custom",
        path: ["title"],
        message: `title must be 1-${STORY_LIMITS.maxTitleWords} words, got ${titleWords}`,
      });
    }
    if (story.characters.length < 1 || story.characters.length > STORY_LIMITS.maxCharacters) {
      ctx.addIssue({
        code: "custom",
        path: ["characters"],
        message: `story must have 1-${STORY_LIMITS.maxCharacters} characters`,
      });
    }
  });

export type GeneratedStory = z.infer<typeof storySchema>;
