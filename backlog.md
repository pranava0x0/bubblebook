# Backlog

- **(medium) Cross-STORY character consistency.** Claude now draws each page
  (`src/lib/illustrate.ts`), and a per-story cast sheet keeps a character stable
  *within* a book. Across books it drifts: a summoned friend is redrawn from its
  `look` text alone. Persist the cast sheet (hexes + proportions) on
  `characters` alongside a cached `image_path`, and feed it to later stories.
- **(high) Illustration latency + timeout budget.** A 12-page book is now three
  model stages back to back: write (~25s) → art-direct (~55s) → draw (6 parallel
  2-page batches, ~155s), plus a redraw pass when a batch drops — measured ~235s.
  Worst case the *internal* per-stage timeouts don't fit the platform budget:
  story 90s + art 90s + two draw passes at 180s each = 540s against a 300s
  `maxDuration`, so a merely-slow run gets cut off by the platform before the
  page-by-page placeholder fallback can finish. Harmless self-hosted (`next
  start` ignores the cap), but the real fix earns its keep: stream the story
  text into the reader immediately, then fill each page's art in as its batch
  lands, instead of blocking the whole POST on the last picture — which also
  makes the internal timeouts moot.
- **(low) OpenAI `gpt-image-1` path is still unverified** against a live key. No
  longer on the default route (Claude draws, keyless), so it only matters if a
  deploy wants raster art. Verify contract/pricing/ToS first.
- **(high) Age dial.** Parent settings UI for `profiles.default_age_months` +
  a prompt ladder (18–36mo: 2–5 words; 3–4y: the current 1–2 sentences; 5y+:
  paragraphs, quizzes). Schema already carries `target_age_months` per story.
  Note the floor moved: every story is now 8–12 pages of 1–2 sentences, so the
  youngest band needs its *own* shorter shape rather than inheriting this one.
- **(medium) Spend guard on /api/stories.** Per-user daily story cap counted on
  the stories table (fail closed) before the model call.
- **(medium) ESLint + CI.** `eslint-config-next`, then a PR workflow running
  typecheck + vitest + build (the same gate on pull_request, not just push).
- **(medium) PWA manifest + icons** so the app installs to a tablet home screen.
- **(low) Supabase dashboard: enable leaked-password protection** (security
  advisor; the app is magic-link-first, so low urgency).
- **(medium) Verify the subscription generation path end-to-end** once a
  `claude setup-token` value is in `.env.local`: confirm claude-sonnet-5 over
  the OAuth token returns a valid story (custom system prompt accepted, not
  identity-gated). If gated, the legitimate fallbacks are the Agent SDK or an
  API key — do not spoof the Claude Code identity.
- **(low) Audio narration** — parent-recorded per page, or TTS.
- **(low) Anonymous sign-in "Try it" button** (enable anonymous auth in Supabase).
- **(low) next/image + remotePatterns** once the image host is final (SVG
  placeholders need `dangerouslyAllowSVG`, so plain `<img>` for now).
- **(low) Footer source link** points at the GitHub profile; update to the repo
  URL when one is published.
- **(low) Dependency bumps parked by the 7-day cooldown** (2026-07-06):
  `@supabase/supabase-js` 2.110.0, `framer-motion` 12.42.2, `lucide-react`
  1.23.0, `vitest` 4.1.10, `@anthropic-ai/sdk` 0.110.0.

## From the four-perspective review (2026-07-08, PR #3)

- **(high) Server-side idempotency / cost guard on generation** — a retry or
  direct re-POST to `/api/stories` re-runs the whole expensive generation
  (double subscription spend). The client already gates the realistic
  double-tap (the button unmounts), so this needs a per-user in-flight lock or a
  short rate window, keyed on the signal not a terminal timestamp (fail closed).
- **(medium) Preserve a billed story when one page image fails** — the
  `Promise.all` over `makePageImage` discards the already-generated story if any
  single page image throws. Only bites the OpenAI image path (placeholder SVGs
  can't fail), so parked until that path is enabled; fix with
  `Promise.allSettled` + a placeholder fallback for the failed page.
- **(medium) Multi-user deploy credential story** — subscription-first
  precedence is correct for personal use, but a hosted multi-user deploy must
  set `ANTHROPIC_API_KEY` only (a personal OAuth token would 500 or bill every
  user to one plan). Document the deploy switch clearly before hosting.
- **(low) Full storage↔DB transactionality** — the pipeline is now compensated
  (orphan cleanup + checked delete), but not atomic. A saga/temp-then-commit
  design is the real fix if partial states ever matter.
- **(low) Public story-images bucket is world-readable by URL** — fine for
  generic placeholder art; revisit with signed URLs before any real
  illustration or photo of a child ships.
- **(low) Story seeds as verbs, not portraits** — some `THEMES` seeds ("a soft
  sleepy cat") are static; a verb gives the model a story to build on.
- **(low) Add a food theme** (a top toddler interest) to `THEMES`.
- **(low) Making-screen message dead-ends on "Almost ready…"** past ~12s; the
  📖 keeps bouncing so there is a heartbeat, but a slow (>30s) generation could
  show a longer/rotating reassurance.
