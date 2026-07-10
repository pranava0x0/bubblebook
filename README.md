# Bubble Book

A storybook app for parents and 2-year-olds to make and read together. Tap a
picture (Dog, Truck, Moon…), get an 8–12 page board book — one or two short
sentences per page, one big picture per screen, a refrain that comes back —
then keep the characters in a vault so they can star in the next story.

Stack: Next.js 15 (App Router) · Tailwind CSS 4 · Supabase (auth, Postgres,
storage) · Anthropic `claude-sonnet-5`, which both writes the story and draws
each page.

## Run it

```sh
npm ci
npm run dev
# open http://localhost:3000
```

`.env.local` is already pointed at the live Supabase project for this repo
(`bubble-book` / `fwhdonlyhnezjnskjvcb`, migrations applied).

### Story generation auth — run it on your Claude subscription

Story text is generated through the official Anthropic SDK, which resolves a
credential per request (see [anthropic-auth.ts](src/lib/anthropic-auth.ts)):

1. **`CLAUDE_CODE_OAUTH_TOKEN` (subscription, no API bill).** In a terminal:

   ```sh
   claude setup-token
   ```

   Paste the printed token into `.env.local` as `CLAUDE_CODE_OAUTH_TOKEN`.
   Inference then bills against your Claude Pro/Max plan (counts toward your
   usage limits), sent with the `oauth-2025-04-20` beta header the same way
   Claude Code does. Good for local, personal use.

2. **`ANTHROPIC_API_KEY` (pay-as-you-go).** Set this instead for a real or
   shared deployment — a subscription token is for your own use, not a
   backend serving other people.

The subscription token is preferred when both are present. Note: an earlier
`ant auth login` OAuth profile authenticates against the **developer platform**
(API credits), not your subscription — that path returns "credit balance too
low" unless the org has API credits, which is why `setup-token` is the
subscription route.

### One manual Supabase step

Dashboard → Authentication → URL Configuration → add to **Redirect URLs**:

```
http://localhost:3000/auth/callback
```

(add the production equivalent when deploying). Everything else — schema, RLS,
storage bucket + policies, signup trigger — is in `supabase/migrations/` and
already applied.

### Illustrations

Claude draws them, on the same credential that writes the story — no image key,
no per-image bill. Three layers, run in order over one POST:

1. **Story** (`generate-story.ts`) writes *only words* — title, pages, cast.
   The writer never describes a picture, so it spends its whole attention on
   the text.
2. **Art direction** (`planArt` in `illustrate.ts`) reads the finished story and
   returns a JSON **visual plan**: a shared palette, a per-character style sheet
   with exact hexes and a signature detail, and a tight, specific scene for
   every page — deliberately varying the framing (close-up, wide, from behind,
   bird's-eye) so the book doesn't read as the same centered pose twelve times.
   Giving this its own pass, with the whole story in view, is what makes the
   pictures specific instead of loose.
3. **Drawing** (`illustrate.ts`) turns each scene into an SVG. Pages go two per
   call, calls in parallel (four pages of SVG in one reply runs past the
   timeout). Every call is handed the same style sheet, which is what keeps the
   character identical across calls that never see each other's output. A whole
   batch can fail at once, so a second pass redraws just the still-missing pages.

Model-authored SVG is never trusted: `sanitizeSvg` allowlists the drawing
elements, rejects anything that can script/fetch/embed, **and** rejects
malformed XML (a duplicate attribute makes the browser fail to render the image
at all). A page that fails to arrive, fails the sanitizer, or fails the retry
falls back to placeholder art (one big emoji on a flat scene) rather than
sinking the book — the fallback is always a valid picture, never a broken one.

The art-direction plan also feeds the non-Claude providers (its scene text is
the prompt, its emoji the placeholder). `IMAGE_PROVIDER` overrides the default:
`openai` (gpt-image-1, needs `OPENAI_API_KEY`, still unverified against a live
key) or `placeholder`. With no Claude credential at all, the plan is derived
from the story text so the keyless path still works.

## Verify

```sh
npm run typecheck && npm test && npm run build
```

## Map

| Path | What it is |
| --- | --- |
| `src/app/bookshelf/` | cover-grid history of saved stories |
| `src/app/create/` | the tap-a-picture story wizard + character vault grid |
| `src/app/story/[id]/` | full-screen board-book reader (swipe or giant arrows) |
| `src/app/api/stories/` | POST: write story → art-direct → draw → save story/pages/characters |
| `src/app/login/`, `src/app/auth/` | email magic-link auth |
| `src/lib/story-schema.ts` | zod contract for the story text (word/sentence/page limits) |
| `src/lib/generate-story.ts` | the authoring brief + the story call (words only) |
| `src/lib/claude.ts` | one text-in/text-out call to Claude (CLI or SDK transport) |
| `src/lib/illustrate.ts` | art direction (visual plan) + Claude draws each page as SVG |
| `src/lib/images.ts` | provider choice + placeholder SVG art + OpenAI provider |
| `src/lib/constants.ts` | themes, tile colors, limits, model id — single source |
| `supabase/migrations/` | schema + RLS + storage policies (applied to the live project) |
| `docs/design.md` | the board-book design identity |

## Decisions

- **Model:** the brief named Claude 3.5 Sonnet, retired Oct 2025;
  `claude-sonnet-5` is its designated replacement (`src/lib/constants.ts`).
- **Official Anthropic SDK instead of the Vercel AI SDK** (a deviation from the
  original brief): the official SDK reads `ant auth login` OAuth profiles, so
  local dev runs on a Claude subscription with no API key. The AI SDK's
  Anthropic provider is key-only.
- **Age foundation, not age features:** `stories.target_age_months` and
  `profiles.default_age_months` exist now (default 24); the reading-level
  ladder that consumes them is backlog.
- **No dark mode** — product decision, see `docs/design.md`.

## Living files

`backlog.md` (what's next) · `issues.md` (bug audit trail) · `security.md`
(supply-chain advisory log — refresh before any dependency change).
