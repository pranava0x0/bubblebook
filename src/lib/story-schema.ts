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

// An ellipsis ends a sentence too: the brief asks sleepy books to close on
// "Goodnight…", so treating it as a fragment would reject a page we asked for.
const SENTENCE_END = /[.!?…]/;

// Counts sentences by terminal punctuation. A run of terminators ("Wow!!") is
// one sentence; a trailing fragment carrying no terminator counts as none, and
// the terminator check below rejects that separately so it can't slip through.
export function countSentences(text: string): number {
  const sentences = text.match(/[^.!?…]+[.!?…]+/g) ?? [];
  return sentences.filter((sentence) => countWords(sentence) > 0).length;
}

// The story layer writes only words. The picture for each page — scene and
// emoji — is a separate art-direction pass over the finished story (see
// src/lib/illustrate.ts), so the writer can spend its whole attention on text.
//
// Constraints live in superRefine, not in .min()/.max(): Anthropic structured
// outputs reject JSON-schema string/array constraints (minLength, minItems),
// while zod refinements stay client-side and still gate the parsed object.
const pageSchema = z
  .object({
    text: z
      .string()
      .describe(
        'The page text: 1 or 2 short sentences, 2 to 16 words total, e.g. "The big red truck rumbles up the hill. Beep, beep!"',
      ),
  })
  .superRefine((page, ctx) => {
    const text = page.text.trim();
    const words = countWords(text);
    if (words < STORY_LIMITS.minWordsPerPage || words > STORY_LIMITS.maxWordsPerPage) {
      ctx.addIssue({
        code: "custom",
        path: ["text"],
        message: `page text must be ${STORY_LIMITS.minWordsPerPage}-${STORY_LIMITS.maxWordsPerPage} words, got ${words}`,
      });
    }
    if (!SENTENCE_END.test(text.slice(-1))) {
      ctx.addIssue({
        code: "custom",
        path: ["text"],
        message: "page text must end with . ! ? or …",
      });
    }
    const sentences = countSentences(text);
    if (sentences < 1 || sentences > STORY_LIMITS.maxSentencesPerPage) {
      ctx.addIssue({
        code: "custom",
        path: ["text"],
        message: `page text must be 1-${STORY_LIMITS.maxSentencesPerPage} sentences, got ${sentences}`,
      });
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
    // Cosmetic only (the vault tile, which falls back to ⭐). The model
    // occasionally returns null here; tolerate it rather than fail the whole
    // story over a decorative field. Page emoji (which drives the picture)
    // stays strictly required.
    emoji: z
      .string()
      .nullish()
      .transform((value) => value ?? "")
      .describe("One emoji that best represents this character"),
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
