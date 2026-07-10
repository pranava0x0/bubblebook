import { askClaude, hasClaudeCredential } from "@/lib/claude";
import { ILLUSTRATION } from "@/lib/constants";
import {
  makePageImage,
  placeholderSvg,
  resolveImageProvider,
  type PageImage,
} from "@/lib/images";

export type IllustrationPage = {
  pageNumber: number;
  imagePrompt: string;
  emoji: string;
};

export type IllustrationCharacter = { name: string; look: string };

const BATCH_TIMEOUT_MS = 180_000;
const CAST_SHEET_TIMEOUT_MS = 60_000;

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

export function illustratorSystemPrompt(): string {
  return `You are an illustrator for toddler board books. You draw by writing SVG code — nothing else.

Every picture:
- One <svg> element, exactly \`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">\`.
- Flat vector style: big bold shapes, thick dark outlines (stroke="#2E2A28" with stroke-width between 8 and 16), bright cheerful colors, rounded friendly forms. Think Sandra Boynton and Eric Carle, not clip art.
- ONE clear subject, large, filling most of the frame. A simple background: a flat sky band, a ground curve, maybe two or three clouds, a sun, a hill, some grass tufts.
- Faces are simple and happy: dot eyes, a small curved smile. Never scary, never sad.
- NO text, letters, or numbers anywhere in the picture.
- Use ONLY these elements: svg, title, defs, g, path, circle, ellipse, rect, line, polyline, polygon, linearGradient, radialGradient, stop. No <text>, no <image>, no <use>, no <style>, no <script>, no filters, no animation, no external URLs, no event attributes.
- Keep each picture under ${ILLUSTRATION.maxSvgChars} characters.

CONSISTENCY IS THE POINT: the same character appears on many pages. Draw them with the same colors, the same proportions, the same details every single time. Only their pose, expression, and surroundings change.

Output format — for each page you are asked to draw, emit its marker on its own line, then its raw SVG:

[page 3]
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">…</svg>
[page 4]
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">…</svg>

No markdown fences. No commentary before, between, or after. Just markers and SVG.`;
}

export function castSheetSystemPrompt(): string {
  return `You are the art director for a toddler board book. Given the cast, write the style sheet the illustrators will draw from.

Be exact and terse. No prose, no preamble, no markdown — just these lines:

PALETTE: sky #RRGGBB, ground #RRGGBB, outline #RRGGBB
<CHARACTER NAME>: body #RRGGBB, <2-4 more parts each with an exact hex>, <one signature detail>, <rough proportions, e.g. "head is half the body">

One line per character. Bright, warm, high-contrast colors a two-year-old can name. The outline is one near-black used for every shape in the book.`;
}

export function castSheetUserPrompt(characters: IllustrationCharacter[]): string {
  return [
    "The cast:",
    ...characters.map((c) => `- ${c.name}: ${c.look}`),
    "",
    "Write the style sheet.",
  ].join("\n");
}

export function illustratorUserPrompt(
  characters: IllustrationCharacter[],
  batch: IllustrationPage[],
  castSheet: string,
): string {
  const parts: string[] = [];
  if (characters.length > 0) {
    parts.push(
      "The cast of this book — draw each of them exactly this way on every page they appear:",
      ...characters.map((c) => `- ${c.name}: ${c.look}`),
      "",
    );
  }
  // The sheet is what makes page 2 and page 11 agree: each batch is drawn by a
  // separate call that never sees the others' output, only this.
  if (castSheet.trim().length > 0) {
    parts.push(
      "STYLE SHEET — use these exact hex colors and proportions, no substitutions:",
      castSheet.trim(),
      "",
    );
  }
  parts.push(`Draw these ${batch.length} pages:`);
  for (const page of batch) {
    parts.push(`[page ${page.pageNumber}] ${page.imagePrompt}`);
  }
  parts.push("", "Respond with only the page markers and their SVG.");
  return parts.join("\n");
}

// A style sheet is a nice-to-have, not a gate: if it fails, the batches still
// have each character's `look` and draw a slightly less consistent book.
async function drawCastSheet(characters: IllustrationCharacter[]): Promise<string> {
  if (characters.length === 0) return "";
  try {
    return await askClaude({
      system: castSheetSystemPrompt(),
      user: castSheetUserPrompt(characters),
      maxTokens: 600,
      timeoutMs: CAST_SHEET_TIMEOUT_MS,
    });
  } catch (error) {
    console.error("[illustrate] cast sheet failed; drawing from looks alone:", error);
    return "";
  }
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

// Returns the SVG if every tag is on the allowlist and it carries no scripting,
// external reference, or entity trickery — otherwise null. Null means "fall back
// to the placeholder", never "ship it and hope".
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
  characters: IllustrationCharacter[],
  batch: IllustrationPage[],
  castSheet: string,
): Promise<Map<number, string>> {
  const drawn = new Map<number, string>();
  let text: string;
  try {
    text = await askClaude({
      system: illustratorSystemPrompt(),
      user: illustratorUserPrompt(characters, batch, castSheet),
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

// Illustrates a whole story with Claude. Batches run in parallel; each page that
// didn't come back with usable art falls back to the deterministic placeholder,
// so a story always has one image per page.
export async function illustrateWithClaude(
  characters: IllustrationCharacter[],
  pages: IllustrationPage[],
): Promise<PageImage[]> {
  const castSheet = await drawCastSheet(characters);
  const batches = chunk(pages, ILLUSTRATION.batchSize);
  const results = await Promise.all(
    batches.map((batch) => drawBatch(characters, batch, castSheet)),
  );

  const drawn = new Map<number, string>();
  for (const result of results) {
    for (const [pageNumber, svg] of result) drawn.set(pageNumber, svg);
  }

  const missing = pages.filter((page) => !drawn.has(page.pageNumber)).length;
  if (missing > 0) {
    console.error(`[illustrate] ${missing}/${pages.length} pages fell back to placeholder art`);
  }
  return pages.map((page) =>
    svgImage(drawn.get(page.pageNumber) ?? placeholderSvg(page.emoji, page.imagePrompt)),
  );
}

// The one entry point the story route uses: art for every page, by whichever
// provider is configured.
export async function makeStoryImages(story: {
  pages: Array<{ imagePrompt: string; emoji: string }>;
  characters: IllustrationCharacter[];
}): Promise<PageImage[]> {
  const pages: IllustrationPage[] = story.pages.map((page, index) => ({
    pageNumber: index + 1,
    imagePrompt: page.imagePrompt,
    emoji: page.emoji,
  }));

  const provider = resolveImageProvider({
    IMAGE_PROVIDER: process.env.IMAGE_PROVIDER,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    hasClaudeCredential: hasClaudeCredential(),
  });

  if (provider === "claude") {
    return illustrateWithClaude(story.characters, pages);
  }
  return Promise.all(
    pages.map((page) =>
      makePageImage({ prompt: page.imagePrompt, emoji: page.emoji, provider }),
    ),
  );
}
