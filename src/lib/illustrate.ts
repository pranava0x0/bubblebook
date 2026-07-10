import { z } from "zod";
import { askClaude, hasClaudeCredential } from "@/lib/claude";
import { ILLUSTRATION } from "@/lib/constants";
import { extractJsonObject } from "@/lib/generate-story";
import {
  makePageImage,
  placeholderSvg,
  resolveImageProvider,
  type PageImage,
} from "@/lib/images";

export type IllustrationCharacter = { name: string; look: string; emoji?: string | null };

// The finished story, handed to the art layer. Words in, pictures out.
export type StoryForArt = {
  title: string;
  pages: Array<{ text: string }>;
  characters: IllustrationCharacter[];
};

// One page's finished illustration plus the scene text it was drawn from (kept
// for the reader's alt text and the pages.image_prompt column).
export type IllustratedPage = { imagePrompt: string; emoji: string; image: PageImage };

// A page ready to draw: its number, the scene the art director wrote, its emoji.
type IllustrationPage = { pageNumber: number; scene: string; emoji: string };

const ART_PLAN_TIMEOUT_MS = 90_000;
const BATCH_TIMEOUT_MS = 180_000;

// Everything an SVG needs to draw a flat board-book scene, and nothing that can
// fetch, script, or embed. Rendered through <img>, an SVG can't run script
// anyway — but these files live in a public storage bucket and get linked
// directly, so the allowlist is what makes that safe rather than the <img>.
const ALLOWED_TAGS = new Set([
  "svg",
  "title",
  "desc",
  "defs",
  "g",
  "path",
  "circle",
  "ellipse",
  "rect",
  "line",
  "polyline",
  "polygon",
  "lineargradient",
  "radialgradient",
  "stop",
]);

// ---------------------------------------------------------------------------
// Art direction: one pass over the whole finished story that writes the visual
// bible — palette, a per-character style sheet with exact hexes, and a tight
// scene for every page. This is what the story writer used to dash off inline;
// giving it its own call, with the entire story in view, is what makes the
// pictures specific and consistent instead of loose.
// ---------------------------------------------------------------------------

const artPlanSchema = z.object({
  palette: z.object({
    sky: z.string(),
    ground: z.string(),
    outline: z.string(),
  }),
  cast: z.array(z.object({ name: z.string(), sheet: z.string() })),
  pages: z.array(
    z.object({
      page: z.number().int().positive(),
      scene: z.string(),
      emoji: z.string(),
    }),
  ),
});

export type ArtPlan = z.infer<typeof artPlanSchema>;

export function artDirectorSystemPrompt(): string {
  return `You are the art director for a toddler board book. You are given the finished story — every word is already written — and you produce the complete visual plan the illustrators will draw from. Return ONLY a JSON object, no prose, no markdown.

The plan has three parts:

1. palette — the three colors shared by every page: a "sky" (or overall background), a "ground", and one near-black "outline" used for every shape in the book. Bright, warm, high-contrast colors a two-year-old can name.

2. cast — one entry per character. "sheet" is an exact, terse recipe the illustrator must follow on every page: an explicit hex for each body part, one signature detail, and rough proportions (e.g. "head is half the whole body"). This is what keeps the character identical from page 2 to page 11.

3. pages — one entry per page of the story, each with:
   - "scene": a tight, concrete description of the single picture. Name the subject and exactly what it is doing and feeling, the camera framing, and one or two background elements pulled from the story. Be specific — "Biscuit sits low in the grass, ears drooping, staring at the empty spot where the ball was, seen up close" beats "Biscuit looks for the ball". VARY the framing across the book: some close on the face, some wide, some from behind, some low to the ground — never the same centered composition twice in a row. Keep the character exactly as their cast entry describes. No text, letters, or numbers appear in any picture.
   - "emoji": one emoji that stands in for this page if the drawing can't be made.

Return exactly this shape:
{"palette":{"sky":"#RRGGBB","ground":"#RRGGBB","outline":"#RRGGBB"},"cast":[{"name":"...","sheet":"..."}],"pages":[{"page":1,"scene":"...","emoji":"..."}]}`;
}

export function artDirectorUserPrompt(story: StoryForArt): string {
  const parts = [`Story: "${story.title}"`, ""];
  if (story.characters.length > 0) {
    parts.push(
      "Cast (keep each look):",
      ...story.characters.map((c) => `- ${c.name}: ${c.look}`),
      "",
    );
  }
  parts.push("Pages, in order:");
  story.pages.forEach((page, index) => parts.push(`${index + 1}. ${page.text}`));
  parts.push("", "Write the visual plan as JSON.");
  return parts.join("\n");
}

// A plan without a real art-director call: derive one from the story so the
// keyless path (no Claude credential) and any art-director failure still yield
// a drawable scene and an emoji for every page.
export function derivePlan(story: StoryForArt): ArtPlan {
  const lead = story.characters[0];
  const leadEmoji = lead?.emoji?.trim() || "📖";
  return {
    palette: { sky: "#BEE7FB", ground: "#CFE8B8", outline: "#2E2A28" },
    cast: story.characters.map((c) => ({ name: c.name, sheet: c.look })),
    pages: story.pages.map((page, index) => ({
      page: index + 1,
      scene: lead ? `${lead.name} (${lead.look}). ${page.text}` : page.text,
      emoji: leadEmoji,
    })),
  };
}

// Every page has a scene and an emoji, even if the art director dropped one or
// numbered outside 1..N: fall back to the derived plan for anything missing.
function normalizePlan(plan: ArtPlan, story: StoryForArt): ArtPlan {
  const fallback = derivePlan(story);
  const byPage = new Map(plan.pages.map((p) => [p.page, p]));
  return {
    palette: plan.palette,
    cast: plan.cast.length > 0 ? plan.cast : fallback.cast,
    pages: fallback.pages.map((f) => {
      const planned = byPage.get(f.page);
      const scene = planned?.scene?.trim();
      const emoji = planned?.emoji?.trim();
      return {
        page: f.page,
        scene: scene && scene.length >= 8 ? scene : f.scene,
        emoji: emoji && emoji.length > 0 ? emoji : f.emoji,
      };
    }),
  };
}

export async function planArt(story: StoryForArt): Promise<ArtPlan> {
  let text: string;
  try {
    text = await askClaude({
      system: artDirectorSystemPrompt(),
      user: artDirectorUserPrompt(story),
      maxTokens: 4000,
      timeoutMs: ART_PLAN_TIMEOUT_MS,
    });
  } catch (error) {
    console.error("[illustrate] art direction failed; deriving a plan from the text:", error);
    return derivePlan(story);
  }
  const json = extractJsonObject(text);
  const parsed = json ? artPlanSchema.safeParse(JSON.parse(json)) : null;
  if (!parsed || !parsed.success) {
    console.error("[illustrate] art plan was not valid JSON; deriving from the text");
    return derivePlan(story);
  }
  return normalizePlan(parsed.data, story);
}

// The palette + cast, formatted as the sheet each drawing batch obeys. Batches
// are drawn by separate calls that never see each other's output, so this text
// is the only thing keeping the same character the same colors across them.
export function styleSheetFrom(plan: ArtPlan): string {
  const lines = [
    `PALETTE: sky ${plan.palette.sky}, ground ${plan.palette.ground}, outline ${plan.palette.outline}`,
    ...plan.cast.map((c) => `${c.name}: ${c.sheet}`),
  ];
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Drawing: Claude writes an SVG per page, in small parallel batches.
// ---------------------------------------------------------------------------

export function illustratorSystemPrompt(): string {
  return `You are an illustrator for toddler board books. You draw by writing SVG code — nothing else.

Every picture:
- One <svg> element, exactly \`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">\`.
- Flat vector style: big bold shapes, thick dark outlines (the outline color from the style sheet, stroke-width between 8 and 16), bright cheerful colors, rounded friendly forms. Think Sandra Boynton and Eric Carle, not clip art.
- Draw the scene you are given faithfully — its subject, action, framing, and background. Fill most of the frame; leave no big empty margins.
- Faces are simple and happy: dot eyes, a small curved smile. Never scary, never sad.
- NO text, letters, or numbers anywhere in the picture.
- Use ONLY these elements: svg, title, defs, g, path, circle, ellipse, rect, line, polyline, polygon, linearGradient, radialGradient, stop. No <text>, no <image>, no <use>, no <style>, no <script>, no filters, no animation, no external URLs, no event attributes.
- Keep each picture under ${ILLUSTRATION.maxSvgChars} characters.

CONSISTENCY IS THE POINT: the same character appears on many pages. Use the exact hex colors and proportions from the style sheet every single time. Only pose, expression, framing, and surroundings change.

Output format — for each page you are asked to draw, emit its marker on its own line, then its raw SVG:

[page 3]
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">…</svg>
[page 4]
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">…</svg>

No markdown fences. No commentary before, between, or after. Just markers and SVG.`;
}

export function illustratorUserPrompt(styleSheet: string, batch: IllustrationPage[]): string {
  const parts = [
    "STYLE SHEET — use these exact hex colors and proportions, no substitutions:",
    styleSheet.trim(),
    "",
    `Draw these ${batch.length} pages:`,
  ];
  for (const page of batch) {
    parts.push(`[page ${page.pageNumber}] ${page.scene}`);
  }
  parts.push("", "Respond with only the page markers and their SVG.");
  return parts.join("\n");
}

// Pulls each `[page N]` … `</svg>` block out of the model's reply. Tolerant of
// stray prose and markdown fences between blocks: it seeks the next `<svg` after
// each marker rather than assuming the response is clean.
export function parseIllustrations(text: string): Map<number, string> {
  const found = new Map<number, string>();
  const markers = [...text.matchAll(/\[page\s*(\d+)\]/gi)];
  for (const [markerIndex, marker] of markers.entries()) {
    const pageNumber = Number(marker[1]);
    const searchFrom = marker.index + marker[0].length;
    // Never let one page's SVG be scavenged from the next page's block.
    const searchTo = markers[markerIndex + 1]?.index ?? text.length;
    const region = text.slice(searchFrom, searchTo);
    const start = region.indexOf("<svg");
    const end = region.lastIndexOf("</svg>");
    if (start === -1 || end === -1 || end < start) continue;
    found.set(pageNumber, region.slice(start, end + "</svg>".length));
  }
  return found;
}

// A repeated attribute on one element (e.g. two `stroke=`s, a common model
// slip) is a fatal XML well-formedness error: an SVG served as image/svg+xml
// and loaded via <img> then fails to render at all. Catch it so the page falls
// back to placeholder art (and the retry redraws it) instead of shipping a
// broken image the allowlist would happily pass.
function hasDuplicateAttribute(svg: string): boolean {
  for (const tag of svg.matchAll(/<[a-zA-Z][^>]*>/g)) {
    const seen = new Set<string>();
    for (const attr of tag[0].matchAll(/\s([\w:-]+)\s*=/g)) {
      const name = attr[1].toLowerCase();
      if (seen.has(name)) return true;
      seen.add(name);
    }
  }
  return false;
}

// Returns the SVG if every tag is on the allowlist, it carries no scripting,
// external reference, or entity trickery, and it is well-formed — otherwise
// null. Null means "fall back to the placeholder", never "ship it and hope".
export function sanitizeSvg(svg: string): string | null {
  const trimmed = svg.trim();
  if (!trimmed.startsWith("<svg") || !trimmed.endsWith("</svg>")) return null;
  if (trimmed.length > ILLUSTRATION.maxSvgChars) return null;

  const lower = trimmed.toLowerCase();
  // Doctypes and entity declarations (billion-laughs, external entities).
  if (lower.includes("<!")) return null;
  // Event handlers: onclick=, onload=, …
  if (/\son[a-z]+\s*=/i.test(trimmed)) return null;
  // Any link out — including xlink:href, javascript:, data:, and url(http…).
  if (/\bhref\s*=/i.test(trimmed)) return null;
  if (lower.includes("javascript:") || lower.includes("data:")) return null;
  if (/url\(\s*['"]?(?!#)/i.test(trimmed)) return null;

  for (const match of trimmed.matchAll(/<\s*\/?\s*([a-z][\w:-]*)/gi)) {
    if (!ALLOWED_TAGS.has(match[1].toLowerCase())) return null;
  }
  if (!lower.includes("viewbox")) return null;
  if (hasDuplicateAttribute(trimmed)) return null;
  return trimmed;
}

function chunk<T>(items: T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += size) batches.push(items.slice(i, i + size));
  return batches;
}

function svgImage(svg: string): PageImage {
  return { bytes: Buffer.from(svg, "utf8"), contentType: "image/svg+xml", ext: "svg" };
}

// Draws one batch. A batch that fails — transport error, garbled output, an SVG
// that doesn't survive the sanitizer — yields nothing for its pages rather than
// killing the book; the caller substitutes placeholder art page by page.
async function drawBatch(
  styleSheet: string,
  batch: IllustrationPage[],
): Promise<Map<number, string>> {
  const drawn = new Map<number, string>();
  let text: string;
  try {
    text = await askClaude({
      system: illustratorSystemPrompt(),
      user: illustratorUserPrompt(styleSheet, batch),
      maxTokens: 16000,
      timeoutMs: BATCH_TIMEOUT_MS,
    });
  } catch (error) {
    console.error(
      `[illustrate] batch ${batch.map((p) => p.pageNumber).join(",")} failed:`,
      error,
    );
    return drawn;
  }

  const parsed = parseIllustrations(text);
  for (const page of batch) {
    const raw = parsed.get(page.pageNumber);
    if (!raw) {
      console.error(`[illustrate] page ${page.pageNumber}: model returned no SVG`);
      continue;
    }
    const safe = sanitizeSvg(raw);
    if (!safe) {
      console.error(`[illustrate] page ${page.pageNumber}: SVG rejected by the sanitizer`);
      continue;
    }
    drawn.set(page.pageNumber, safe);
  }
  return drawn;
}

// Draws every page as SVG, batches in parallel. A whole batch can fail at once
// (a transient CLI or rate error takes both its pages down), so after the first
// pass we redraw just the still-missing pages once — additive, gated on what's
// actually absent, so it recovers a dropped batch without redrawing good pages.
// Anything still missing after that falls back to the deterministic placeholder.
async function drawWithClaude(
  styleSheet: string,
  pages: IllustrationPage[],
): Promise<PageImage[]> {
  const drawn = new Map<number, string>();
  let todo = pages;
  for (let attempt = 1; attempt <= 2 && todo.length > 0; attempt++) {
    const batches = chunk(todo, ILLUSTRATION.batchSize);
    const results = await Promise.all(batches.map((batch) => drawBatch(styleSheet, batch)));
    for (const result of results) {
      for (const [pageNumber, svg] of result) drawn.set(pageNumber, svg);
    }
    todo = pages.filter((page) => !drawn.has(page.pageNumber));
    if (todo.length > 0) {
      const which = todo.map((p) => p.pageNumber).join(",");
      console.error(`[illustrate] after attempt ${attempt}, pages ${which} still undrawn`);
    }
  }

  if (todo.length > 0) {
    console.error(`[illustrate] ${todo.length}/${pages.length} pages fell back to placeholder art`);
  }
  return pages.map((page) =>
    svgImage(drawn.get(page.pageNumber) ?? placeholderSvg(page.emoji, page.scene)),
  );
}

// The one entry point the story route uses. Directs the art from the finished
// story, then draws it with whichever provider is configured — always one
// image per page, in page order.
export async function makeStoryImages(story: StoryForArt): Promise<IllustratedPage[]> {
  const plan = await planArt(story);
  const pages: IllustrationPage[] = plan.pages
    .slice()
    .sort((a, b) => a.page - b.page)
    .map((p) => ({ pageNumber: p.page, scene: p.scene, emoji: p.emoji }));

  const provider = resolveImageProvider({
    IMAGE_PROVIDER: process.env.IMAGE_PROVIDER,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    hasClaudeCredential: hasClaudeCredential(),
  });

  const images =
    provider === "claude"
      ? await drawWithClaude(styleSheetFrom(plan), pages)
      : await Promise.all(
          pages.map((page) =>
            makePageImage({ prompt: page.scene, emoji: page.emoji, provider }),
          ),
        );

  return pages.map((page, index) => ({
    imagePrompt: page.scene,
    emoji: page.emoji,
    image: images[index],
  }));
}
