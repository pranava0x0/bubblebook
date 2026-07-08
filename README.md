# Bubble Book

A storybook app for parents and 2-year-olds to make and read together. Tap a
picture (Dog, Truck, Moon…), get a 3–5 page board book — 2 to 5 words per page,
one big picture per screen — then keep the characters in a vault so they can
star in the next story.

Stack: Next.js 15 (App Router) · Tailwind CSS 4 · Supabase (auth, Postgres,
storage) · Anthropic `claude-sonnet-5` for story text.

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

Keyless by default: each page gets deterministic built-in placeholder art (flat
scene + the page's emoji). To use a real image model, set `IMAGE_PROVIDER=openai`
and `OPENAI_API_KEY` — wired but not yet verified against a live key (see
`backlog.md` before relying on it).

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
| `src/app/api/stories/` | POST: generate story → images → save story/pages/characters |
| `src/app/login/`, `src/app/auth/` | email magic-link auth |
| `src/lib/story-schema.ts` | zod contract for generated stories (word/page limits) |
| `src/lib/generate-story.ts` | prompts + structured-output call to Anthropic |
| `src/lib/images.ts` | placeholder SVG art + optional OpenAI provider |
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
