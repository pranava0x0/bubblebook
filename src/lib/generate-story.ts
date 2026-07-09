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
  return `You write board books for a toddler about ${ageMonths} months old — tiny, warm, and made to be read aloud again and again. Think Sandra Boynton, "Brown Bear, Brown Bear", "Goodnight Moon".

Rules:
- ${STORY_LIMITS.minPages} to ${STORY_LIMITS.maxPages} pages. Each page's text is ${STORY_LIMITS.minWordsPerPage} to ${STORY_LIMITS.maxWordsPerPage} words. Examples: "Big truck goes fast!", "Where is the duck?", "Splash, splash, splash!"
- Give the main character a short name and USE THAT NAME on most pages, so the child re-meets the same friend. If a familiar friend is provided, that friend is the star.
- Work in a REPEATING REFRAIN or call-and-response — a short phrase or question that comes back (e.g. "Where's the ball?" … "There's the ball!", or "Splash, splash, splash!"). The repetition is the point; toddlers ask for it.
- Use words a 2-year-old knows: simple nouns, action words (go, hop, splash, sleep, hug), fun sounds (beep, woof, pop). One idea per page.
- Shape a tiny arc: meet the friend, one small want or wobble, it works out, then a warm close. If the theme is sleepy (moon, bath, night), end soft and calming — "Goodnight…", "Sleep tight."
- End each page's text with . ! or ?
- Title: 2 to ${STORY_LIMITS.maxTitleWords} warm, simple words.
- imagePrompt: one sentence describing that page's picture. Describe the main character the same way on every page, using their exact look. One subject, simple background, no words in the picture.
- emoji: one emoji matching the page's picture.
- characters: the 1 or 2 characters in the story, each with a short reusable look (colors, size, one cute detail) so they can be drawn the same way in future stories.
- Warm and safe. Nothing scary, nothing sad.

Follow this SHAPE (a 3-page example — yours can be ${STORY_LIMITS.minPages} to ${STORY_LIMITS.maxPages} pages; note the repeated name and the "splash" refrain):
{"title":"Little Duck's Splash","pages":[{"text":"Little Duck waddles out.","imagePrompt":"A small round yellow duck with a tiny orange beak waddles across green grass under a sunny sky.","emoji":"🦆"},{"text":"Splash, splash, splash!","imagePrompt":"The same small yellow duck splashes happily in a shallow blue puddle.","emoji":"💦"},{"text":"Sleepy, happy Duck.","imagePrompt":"The same small yellow duck curls up cozy in soft grass, eyes closed.","emoji":"😴"}],"characters":[{"name":"Little Duck","look":"a small round yellow duck with a tiny orange beak and orange feet","emoji":"🦆"}]}

Return ONLY a JSON object, no markdown fences and no words around it, in exactly this shape:
{"title":"...","pages":[{"text":"...","imagePrompt":"...","emoji":"..."}],"characters":[{"name":"...","look":"...","emoji":"..."}]}`;
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
    "Give the star a name and use it on most pages, and work in a repeating refrain.",
    "Respond with only the JSON object.",
  );
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

// Per-attempt CLI timeout. generateStory retries at most twice, so this stays
// comfortably inside the route's maxDuration (120s) even if the first attempt
// times out and a second runs.
const CLI_TIMEOUT_MS = 60_000;

// Build the child env for the subscription CLI. Crucially, DROP any
// ANTHROPIC_API_KEY: if the CLI sees one it can bill pay-as-you-go API credits
// instead of the subscription — silently defeating the whole reason this path
// exists. Pass only the OAuth token. Exported for a regression test.
export function cliSpawnEnv(
  baseEnv: Record<string, string | undefined>,
  token: string,
): Record<string, string | undefined> {
  const { ANTHROPIC_API_KEY: _dropped, ...rest } = baseEnv;
  void _dropped;
  return { ...rest, CLAUDE_CODE_OAUTH_TOKEN: token };
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
      env: cliSpawnEnv(process.env, token) as NodeJS.ProcessEnv,
      timeout: CLI_TIMEOUT_MS,
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
    // A timeout kills the child with SIGTERM (code null); say so plainly
    // instead of the opaque "exited null".
    child.on("close", (code, signal) => {
      if (code === 0) resolve(out);
      else if (signal === "SIGTERM")
        reject(new Error(`claude CLI timed out after ${CLI_TIMEOUT_MS / 1000}s`));
      else reject(new Error(`claude CLI exited ${code ?? signal}: ${err.slice(0, 300)}`));
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
  const choice = resolveCredential();
  const getText = () =>
    choice.kind === "subscription"
      ? rawTextFromClaudeCli(choice.token, seed)
      : rawTextFromSdk(choice.key, seed);
  return generateFromText(getText);
}
