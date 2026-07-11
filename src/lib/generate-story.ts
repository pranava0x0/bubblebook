import { askClaude, extractJsonObject } from "@/lib/claude";
import { STORY_LIMITS } from "@/lib/constants";
import { storySchema, type GeneratedStory } from "@/lib/story-schema";

export type StorySeed = {
  description: string;
  friends: Array<{ name: string; look: string }>;
  ageMonths: number;
};

// Per-attempt timeout. generateStory retries at most twice, so this stays
// inside the route's maxDuration even if the first attempt times out.
const STORY_TIMEOUT_MS = 90_000;

// One narrow age band for now. target_age_months is stored per story so this
// can grow into a real reading-level ladder without a schema change.
export function systemPrompt(ageMonths: number): string {
  return `You write board books for a toddler about ${ageMonths} months old — tiny, warm, and made to be read aloud again and again. Think Sandra Boynton, "Brown Bear, Brown Bear", "Goodnight Moon".

Rules:
- ${STORY_LIMITS.minPages} to ${STORY_LIMITS.maxPages} pages. Each page's text is 1 or 2 short sentences, ${STORY_LIMITS.minWordsPerPage} to ${STORY_LIMITS.maxWordsPerPage} words in total. Short enough to say in one breath.
- Give the main character a short name and USE THAT NAME on most pages, so the child re-meets the same friend. If a familiar friend is provided, that friend is the star.
- Work in a REPEATING REFRAIN or call-and-response — a short phrase or question that comes back (e.g. "Where's the ball?" … "There's the ball!", or "Splash, splash, splash!"). The repetition is the point; toddlers ask for it. Bring it back at least three times across the book, and let a page be nothing but the refrain now and then.
- Use words a 2-year-old knows: simple nouns, action words (go, hop, splash, sleep, hug), fun sounds (beep, woof, pop). One idea per page.
- Shape a real little arc: meet the friend, they set off, a small want or wobble, one gentle surprise, it works out, then a warm close. This is a longer book — give the middle room, and let two or three pages simply enjoy the world before the wobble arrives.
- If the theme is sleepy (moon, bath, night), end soft and calming — "Goodnight…", "Sleep tight."
- End each page's text with . ! ? or …
- Title: 2 to ${STORY_LIMITS.maxTitleWords} warm, simple words.
- characters: the 1 to ${STORY_LIMITS.maxCharacters} characters in the story, each with a short reusable look (colors, size, one cute detail) so they can be drawn the same way in future stories.
- Warm and safe. Nothing scary, nothing sad.

Write the words only — an illustrator draws the pictures afterward from your text, so you don't describe any pictures.

This is the VOICE, shown as the first 3 pages of a book (note the repeated name and the "splash" refrain). Yours must run the full ${STORY_LIMITS.minPages} to ${STORY_LIMITS.maxPages} pages, not 3:
{"title":"Little Duck's Splash","pages":[{"text":"Little Duck waddles out into the sun."},{"text":"Splash, splash, splash!"},{"text":"Little Duck is wet all over. He shakes and shakes!"}],"characters":[{"name":"Little Duck","look":"a small round yellow duck with a tiny orange beak and orange feet","emoji":"🦆"}]}

Return ONLY a JSON object, no markdown fences and no words around it, in exactly this shape:
{"title":"...","pages":[{"text":"..."}],"characters":[{"name":"...","look":"...","emoji":"..."}]}`;
}

export function userPrompt(seed: StorySeed): string {
  const parts = [`Write a new story about: ${seed.description}.`];
  if (seed.friends.length > 0) {
    parts.push(
      "These familiar friends must star in it — keep each name and look exactly:",
      ...seed.friends.map((f) => `- ${f.name} — ${f.look}`),
    );
  }
  parts.push(
    `Give the star a name and use it on most pages, work in a repeating refrain, and write ${STORY_LIMITS.minPages} to ${STORY_LIMITS.maxPages} pages.`,
    "Respond with only the JSON object.",
  );
  return parts.join("\n");
}

// Retry orchestration, separated from credential/transport so it's testable.
// Only INVALID OUTPUT is retried: the zod refinements (word/page counts) can
// fail on a wordy page, and re-generating almost always lands. A transport
// failure (bad token, missing binary, timeout) would fail identically on
// retry and just re-spends — so it's thrown immediately, never retried.
export async function generateFromText(
  getText: () => Promise<string>,
): Promise<GeneratedStory> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 2; attempt++) {
    // Transport: no retry (a retry only double-bills the subscription).
    const text = await getText();
    try {
      const json = extractJsonObject(text);
      if (!json) {
        throw new Error("model returned no JSON object");
      }
      return storySchema.parse(JSON.parse(json));
    } catch (error) {
      lastError = error;
      console.error(`[generate-story] attempt ${attempt} produced invalid output:`, error);
    }
  }
  throw lastError;
}

export async function generateStory(seed: StorySeed): Promise<GeneratedStory> {
  return generateFromText(() =>
    askClaude({
      system: systemPrompt(seed.ageMonths),
      user: userPrompt(seed),
      maxTokens: 8000,
      timeoutMs: STORY_TIMEOUT_MS,
    }),
  );
}
