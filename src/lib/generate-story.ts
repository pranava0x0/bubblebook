import { spawn } from "node:child_process";
import Anthropic from "@anthropic-ai/sdk";
import { resolveCredential } from "@/lib/anthropic-auth";
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

// API-key path: the official SDK against /v1/messages.
async function rawTextFromSdk(key: string, seed: StorySeed): Promise<string> {
  const client = new Anthropic({ apiKey: key });
  const response = await client.messages.create({
    model: STORY_MODEL,
    max_tokens: 8000,
    system: systemPrompt(seed.ageMonths),
    messages: [{ role: "user", content: userPrompt(seed) }],
  });
  return response.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("");
}

// Subscription path: shell out to the Claude Code CLI. A subscription OAuth
// token only authenticates through the CLI's own request path — a raw
// /v1/messages call with the same token is soft-blocked with a bare 429.
// --output-format json wraps the model's answer in an envelope; our board-book
// rules are appended to (not replacing) the CLI's own system prompt so the
// subscription auth the API validates stays intact.
async function rawTextFromClaudeCli(token: string, seed: StorySeed): Promise<string> {
  const bin = process.env.CLAUDE_CLI_BIN || "claude";
  const args = [
    "--print",
    userPrompt(seed),
    "--model",
    STORY_MODEL,
    "--output-format",
    "json",
    "--append-system-prompt",
    systemPrompt(seed.ageMonths),
  ];

  const stdout = await new Promise<string>((resolve, reject) => {
    const child = spawn(bin, args, {
      env: { ...process.env, CLAUDE_CODE_OAUTH_TOKEN: token },
      timeout: 90_000,
    });
    let out = "";
    let err = "";
    child.stdout.on("data", (chunk) => (out += chunk));
    child.stderr.on("data", (chunk) => (err += chunk));
    child.on("error", (error) =>
      reject(
        new Error(
          `could not run the claude CLI (${bin}): ${error.message}. Set CLAUDE_CLI_BIN to its absolute path.`,
        ),
      ),
    );
    child.on("close", (code) => {
      if (code === 0) resolve(out);
      else reject(new Error(`claude CLI exited ${code}: ${err.slice(0, 300)}`));
    });
  });

  let envelope: { result?: unknown; is_error?: boolean; api_error_status?: number };
  try {
    envelope = JSON.parse(stdout);
  } catch {
    throw new Error(`claude CLI returned non-JSON output: ${stdout.slice(0, 200)}`);
  }
  if (envelope.is_error) {
    throw new Error(
      `claude CLI reported an error (status ${envelope.api_error_status ?? "?"}): ${String(
        envelope.result,
      ).slice(0, 200)}`,
    );
  }
  return String(envelope.result ?? "");
}

export async function generateStory(seed: StorySeed): Promise<GeneratedStory> {
  const choice = resolveCredential();

  let lastError: unknown;
  // The zod refinements (word counts, page counts) are checked client-side and
  // can fail on a wordy page. One retry almost always lands; then fail loud.
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const text =
        choice.kind === "subscription"
          ? await rawTextFromClaudeCli(choice.token, seed)
          : await rawTextFromSdk(choice.key, seed);
      const json = extractJsonObject(text);
      if (!json) {
        throw new Error("model returned no JSON object");
      }
      return storySchema.parse(JSON.parse(json));
    } catch (error) {
      lastError = error;
      console.error(`[generate-story] attempt ${attempt} failed:`, error);
    }
  }
  throw lastError;
}
