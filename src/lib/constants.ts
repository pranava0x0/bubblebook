// Single source of truth for themes, tile colors, and generation settings.

export const TILE_COLORS = {
  coral: {
    bg: "bg-coral",
    edge: "[--chunk-edge:var(--color-coral-deep)]",
    text: "text-white",
  },
  sky: {
    bg: "bg-sky",
    edge: "[--chunk-edge:var(--color-sky-deep)]",
    text: "text-white",
  },
  sunshine: {
    bg: "bg-sunshine",
    edge: "[--chunk-edge:var(--color-sunshine-deep)]",
    text: "text-ink",
  },
  grass: {
    bg: "bg-grass",
    edge: "[--chunk-edge:var(--color-grass-deep)]",
    text: "text-white",
  },
  berry: {
    bg: "bg-berry",
    edge: "[--chunk-edge:var(--color-berry-deep)]",
    text: "text-white",
  },
  bubble: {
    bg: "bg-bubble",
    edge: "[--chunk-edge:var(--color-bubble-deep)]",
    text: "text-ink",
  },
} as const;

export type TileColor = keyof typeof TILE_COLORS;

export type Theme = {
  key: string;
  label: string;
  emoji: string;
  seed: string;
  color: TileColor;
};

// The story wizard's tap targets. Familiar 2-year-old subjects only.
export const THEMES: readonly Theme[] = [
  { key: "dog", label: "Dog", emoji: "🐶", seed: "a happy little dog", color: "coral" },
  { key: "cat", label: "Cat", emoji: "🐱", seed: "a soft sleepy cat", color: "sunshine" },
  { key: "truck", label: "Truck", emoji: "🚚", seed: "a big red truck", color: "sky" },
  { key: "train", label: "Train", emoji: "🚂", seed: "a little blue train", color: "grass" },
  { key: "duck", label: "Duck", emoji: "🦆", seed: "a small yellow duck", color: "berry" },
  { key: "moon", label: "Moon", emoji: "🌙", seed: "the friendly moon", color: "sky" },
  { key: "ball", label: "Ball", emoji: "⚽", seed: "a bouncy ball", color: "coral" },
  { key: "bath", label: "Bath", emoji: "🛁", seed: "bubble bath time", color: "bubble" },
] as const;

export const STORY_LIMITS = {
  minPages: 3,
  maxPages: 5,
  minWordsPerPage: 2,
  maxWordsPerPage: 5,
  maxTitleWords: 4,
  maxCharacters: 3,
  maxFriends: 2,
} as const;

// Default target age when a profile has none (yet). Must match the
// `default_age_months` / `target_age_months` column defaults in
// supabase/migrations/0001_init.sql.
export const DEFAULT_AGE_MONTHS = 24;

// The brief asked for "Claude 3.5 Sonnet", which was retired in Oct 2025;
// claude-sonnet-5 is its designated replacement. Swap to "claude-haiku-4-5"
// if cost matters more than polish.
export const STORY_MODEL = "claude-sonnet-5";

export const STORAGE_BUCKET = "story-images";

// [background tint, accent] pairs for the built-in placeholder art.
export const PLACEHOLDER_PALETTES: readonly (readonly [string, string])[] = [
  ["#FFE3DC", "#E8503A"],
  ["#DFF0FB", "#2287C9"],
  ["#FFF3D1", "#DA9E14"],
  ["#DFF5E7", "#2FA35C"],
  ["#EAE4FA", "#7A63D2"],
  ["#FDE7F1", "#C75E8E"],
] as const;
