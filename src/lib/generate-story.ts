import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { STORY_LIMITS, STORY_MODEL } from "@/lib/constants";
import { storySchema, type GeneratedStory } from "@/lib/story-schema";

export type StorySeed = {
  description: string;
  friends: Array<{ name: string; look: string }>;
  ageMonths: number;
};

// One narrow age band for now. target_age_months is stored per story so this
// can grow into a real reading-level ladder without a schema change.
export function systemPrompt(ageMonths: number): string {
  return `You write stories for a toddler about ${ageMonths} months old, in the style of a chunky board book.

Rules:
- ${STORY_LIMITS.minPages} to ${STORY_LIMITS.maxPages} pages. Each page's text is ${STORY_LIMITS.minWordsPerPage} to ${STORY_LIMITS.maxWordsPerPage} words. Examples: "Big truck goes fast!", "Where is the duck?", "Splash, splash, splash!"
- Use words a 2-year-old knows: simple nouns, action words (go, hop, splash, sleep, hug), fun sounds (beep, woof, pop).
- One simple idea per page. Gentle arc: meet the friend, one small adventure, a cozy ending.
- End each page's text with . ! or ?
- Title: 2 to ${STORY_LIMITS.maxTitleWords} simple words.
- imagePrompt: one sentence describing that page's picture. Describe the main character the same way on every page, using their exact look. One subject, simple background, no words in the picture.
- emoji: one emoji matching the page's picture.
- characters: the 1 or 2 characters in the story, each with a short reusable look (colors, size, one cute detail) so they can be drawn the same way in future stories.
- Warm and safe. Nothing scary, nothing sad.`;
}

export function userPrompt(seed: StorySeed): string {
  const parts = [`Write a new story about: ${seed.description}.`];
  if (seed.friends.length > 0) {
    parts.push(
      "Include these familiar friends and keep their look exactly:",
      ...seed.friends.map((f) => `- ${f.name} — ${f.look}`),
    );
  }
  return parts.join("\n");
}

export async function generateStory(seed: StorySeed): Promise<GeneratedStory> {
  // Zero-arg client: credentials resolve from ANTHROPIC_API_KEY if set,
  // otherwise from the OAuth profile stored by `ant auth login`. Local dev on
  // a Claude subscription needs no key in .env.local. Constructed lazily so a
  // missing credential fails this request loudly, not the whole server boot.
  const client = new Anthropic();

  let lastError: unknown;
  // Structured outputs guarantee the JSON shape; the zod refinements (word
  // counts, page counts) are checked client-side and can still fail on a
  // wordy page. One retry almost always lands; then fail loud.
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const response = await client.messages.parse({
        model: STORY_MODEL,
        max_tokens: 8000,
        system: systemPrompt(seed.ageMonths),
        messages: [{ role: "user", content: userPrompt(seed) }],
        output_config: { format: zodOutputFormat(storySchema) },
      });
      if (response.parsed_output) {
        return response.parsed_output;
      }
      throw new Error(
        `story generation returned no valid object (stop_reason: ${response.stop_reason})`,
      );
    } catch (error) {
      lastError = error;
      console.error(`[generate-story] attempt ${attempt} failed:`, error);
    }
  }
  throw lastError;
}
