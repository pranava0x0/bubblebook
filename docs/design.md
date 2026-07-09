# Bubble Book — design identity

Extends the base [DESIGN.md](../DESIGN.md); this file wins on conflict.

**Identity in one line:** a chunky cardboard board book you can tap — flat crayon
primaries on warm cream, one huge picture per screen, and buttons with thick
pressed-down edges like a busy-board toy.

**Reference point:** Sandra Boynton / Priddy "Bright Baby" board books.

## Palette

All tokens live in `src/app/globals.css` (`@theme`). Never hardcode a hex in a component.

| Token | Hex | Role | Text on it |
| --- | --- | --- | --- |
| `paper` | `#FFF6E8` | page background | `ink` (≈10:1) |
| `paper-deep` | `#F7E7CE` | card borders, tile edges | — |
| `ink` | `#43302B` | primary text | — |
| `ink-soft` | `#7C6257` | secondary text on paper (≥4.5:1) | — |
| `coral` / `coral-deep` | `#E8503A` / `#B93A28` | primary action | white, ≥24px bold only |
| `sky` / `sky-deep` | `#2287C9` / `#175E8D` | selection ring, links | white, ≥24px bold only |
| `sunshine` / `sunshine-deep` | `#FFC432` / `#D89C12` | new/creative | `ink` |
| `grass` / `grass-deep` | `#2FA35C` / `#1E7440` | go/confirm | white, ≥24px bold only |
| `berry` / `berry-deep` | `#7A63D2` / `#55429E` | variety tile | white, ≥24px bold only |
| `bubble` / `bubble-deep` | `#F58BB8` / `#C75E8E` | variety tile | `ink` |

Contrast rule: white text sits only on the four saturated mid-tones and only at
large-bold sizes (WCAG large-text 3:1); anything smaller uses `ink` on a light fill.

## The signature move

Every tappable element is a `.chunk`: solid fill, `1.75rem` radius, a hard
`0 6px 0` bottom edge in the fill's `-deep` color, and an `:active` press that
translates down 4px. No hover-lift, no gradients, no glass. The press *is* the
feedback — it's the tactile identity of the whole app.

## Type

Nunito (variable), self-hosted at build via `next/font` — zero runtime font
requests. This is a deliberate deviation from the base system-stack default:
the rounded letterforms are the product's voice for pre-readers. Weights in
use: bold/extrabold/black only. Reader text scales `clamp(2rem → 3.25rem)`.

## Deviations from base DESIGN.md (each deliberate)

- **Web font** — justified above; `next/font` removes the perf objection.
- **Emoji as content, not chrome** — theme tiles, placeholder art, and empty
  states use emoji as *pictures for pre-readers* (the content of the product).
  Emoji remains banned as an icon system; UI glyphs are Lucide, few and huge.
- **Radius** — tiles are far rounder than the base scale. Motion stays inside
  the base 300ms cap (page turns are a 280ms ease-out slide; long spring tails
  proved freezable mid-flight by viewport rotation). `prefers-reduced-motion`
  collapses everything to ≤150ms fades.
- **Hard offset edges instead of soft shadows** — they encode "pressable",
  which is data for this audience, not decoration.
- **No dark mode** — product decision (also in the brief). The cream paper is
  the world of the app; a slate theme would make it read as a tool.

## Copy voice

Board-book register: short, warm, concrete. Exclamation marks are native to the
genre and allowed in kid-facing copy. Parent-facing copy (login, errors,
README) stays plain and specific — no AI register, per base § 11.1.

## Scar tissue (motion)

Page-turn surfaces that get mashed (toddlers) use a **keyed remount with no
exit animation**: `AnimatePresence` exit-unmounts are animation-gated, so ghost
pages accumulate whenever rAF throttles (backgrounded tab). Keep both transform
endpoints in the **same unit** (`"100%"` → `"0%"`): mixing percent with numeric
px forces framer's DOM-measuring unit conversion, a freezable path. First mount
renders at rest so SSR HTML never carries an offscreen transform.

## Toddler-UX principles (2026-07-08)

- **A control a 2-year-old will tap must never be silently dead.** A `disabled`
  primary CTA gives a toddler no feedback ("why did nothing happen?"). Pair it
  with a gentle nudge that appears when it's unavailable ("Tap a picture to
  start! 👆") — the toddler learns the path, the parent isn't puzzled. Prefer
  guiding over blocking.
- **Every ambient animation respects `prefers-reduced-motion`.** framer motion
  is already gated via `useReducedMotion`; CSS animations aren't, so a bare
  `animate-pulse` needs `motion-reduce:animate-none` (the loader used to pulse
  regardless).
- **Read paths a grown-up uses too.** The reader is toddler-first (big arrows,
  swipe) but a parent reads on a laptop — arrow-key page turns cost one
  `useEffect` and make it feel finished.
