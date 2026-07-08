import { resolveAnthropicClient } from "@/lib/anthropic-auth";
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
- Warm and safe. Nothing scary, nothing sad.

Return ONLY a JSON object, no markdown fences and no words around it, in exactly this shape:
{"title":"...","pages":[{"text":"...","imagePrompt":"...","emoji":"..."}],"characters":[{"name":"...","look":"...","emoji":"..."}]}`;
}

export function userPrompt(seed: StorySeed): string {
  const parts = [`Write a new story about: ${seed.description}.`];
  if (seed.friends.length > 0) {
    parts.push(
      "Include these familiar friends and keep their look exactly:",
      ...seed.friends.map((f) => `- ${f.name} — ${f.look}`),
    );
  }
  parts.push("Respond with only the JSON object.");
  return parts.join("\n");
}

// The model is told to return bare JSON, but tolerate a stray markdown fence
// or leading prose by extracting the first balanced {...} object.
export function extractJsonObject(text: string): string | null {
  const start = text.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

export async function generateStory(seed: StorySeed): Promise<GeneratedStory> {
  const { client } = resolveAnthropicClient();

  let lastError: unknown;
  // The zod refinements (word counts, page counts) are checked client-side and
  // can fail on a wordy page. One retry almost always lands; then fail loud.
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const response = await client.messages.create({
        model: STORY_MODEL,
        max_tokens: 8000,
        system: systemPrompt(seed.ageMonths),
        messages: [{ role: "user", content: userPrompt(seed) }],
      });

      const text = response.content
        .filter((block) => block.type === "text")
        .map((block) => block.text)
        .join("");
      const json = extractJsonObject(text);
      if (!json) {
        throw new Error(
          `model returned no JSON object (stop_reason: ${response.stop_reason})`,
        );
      }
      return storySchema.parse(JSON.parse(json));
    } catch (error) {
      lastError = error;
      console.error(`[generate-story] attempt ${attempt} failed:`, error);
    }
  }
  throw lastError;
}
