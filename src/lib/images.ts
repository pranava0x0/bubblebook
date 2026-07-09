import { z } from "zod";
import { PLACEHOLDER_PALETTES } from "@/lib/constants";
import { requiredEnv } from "@/lib/env";

export type PageImage = {
  bytes: Buffer;
  contentType: string;
  ext: string;
};

// Values interpolated into SVG markup must be XML-escaped — whitespace
// stripping alone doesn't stop a quote or angle bracket breaking out.
export function escapeXml(value: string): string {
  return value.replace(/[<>&'"]/g, (ch) => {
    switch (ch) {
      case "<": return "&lt;";
      case ">": return "&gt;";
      case "&": return "&amp;";
      case "'": return "&apos;";
      default: return "&quot;";
    }
  });
}

function hashString(value: string): number {
  let hash = 5381;
  for (let i = 0; i < value.length; i++) {
    hash = ((hash * 33) ^ value.charCodeAt(i)) >>> 0;
  }
  return hash;
}

// Keyless default: a flat, friendly scene with the page's emoji as the star.
// Deterministic for a given prompt so re-runs produce identical art.
export function placeholderSvg(emoji: string, seed: string): string {
  const palette = PLACEHOLDER_PALETTES[hashString(seed) % PLACEHOLDER_PALETTES.length];
  const [tint, accent] = palette;
  const safeEmoji = escapeXml(emoji.slice(0, 8));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" role="img">
  <rect width="1024" height="1024" fill="${tint}"/>
  <circle cx="180" cy="170" r="110" fill="${accent}" opacity="0.14"/>
  <circle cx="880" cy="250" r="70" fill="${accent}" opacity="0.18"/>
  <circle cx="760" cy="120" r="36" fill="${accent}" opacity="0.12"/>
  <ellipse cx="512" cy="1060" rx="740" ry="270" fill="${accent}" opacity="0.22"/>
  <text x="512" y="540" font-size="460" text-anchor="middle" dominant-baseline="central">${safeEmoji}</text>
</svg>`;
}

const ILLUSTRATION_STYLE =
  "Children's board-book illustration, flat vector shapes, thick soft outlines, " +
  "bright primary colors, one friendly subject, simple uncluttered background, " +
  "no text or letters anywhere.";

const openAiImageResponse = z.object({
  data: z.array(z.object({ b64_json: z.string() })).min(1),
});

async function openAiImage(prompt: string): Promise<PageImage> {
  const key = requiredEnv("OPENAI_API_KEY");
  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    // Fail fast on a hung provider: well under the route's 120s maxDuration so
    // the user gets a real error instead of a gateway timeout.
    signal: AbortSignal.timeout(45_000),
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: "gpt-image-1",
      prompt: `${ILLUSTRATION_STYLE} Scene: ${prompt}`,
      size: "1024x1024",
      quality: "medium",
    }),
  });
  if (!res.ok) {
    const body = (await res.text()).slice(0, 300);
    throw new Error(`Image generation failed (${res.status}): ${body}`);
  }
  const parsed = openAiImageResponse.safeParse(await res.json());
  if (!parsed.success) {
    throw new Error(`Image generation returned an unexpected shape: ${parsed.error.message}`);
  }
  return {
    bytes: Buffer.from(parsed.data.data[0].b64_json, "base64"),
    contentType: "image/png",
    ext: "png",
  };
}

export async function makePageImage(input: {
  prompt: string;
  emoji: string;
}): Promise<PageImage> {
  const provider =
    process.env.IMAGE_PROVIDER ?? (process.env.OPENAI_API_KEY ? "openai" : "placeholder");
  if (provider === "openai") {
    return openAiImage(input.prompt);
  }
  return {
    bytes: Buffer.from(placeholderSvg(input.emoji, input.prompt), "utf8"),
    contentType: "image/svg+xml",
    ext: "svg",
  };
}
