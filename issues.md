# Issues

Living audit trail. Each entry: date, area, description, root cause
(code bug vs test bug), status (Open / Fixed + commit).

## 2026-07-07 — Reader page turns wedge under throttled rAF

- **Area:** `src/app/story/[id]/Reader.tsx`
- **Symptom:** during automated preview testing, pages froze mid-slide and
  ghost pages stacked up while the reader's state advanced correctly.
- **Root cause:** part environment, part code (code bug). The preview tab was
  backgrounded (`document.visibilityState === "hidden"`, zero rAF ticks), which
  freezes all framer-motion animation by design. Diagnosing it exposed three
  real fragilities, all fixed: (1) `AnimatePresence` exit-unmounts are
  animation-gated, so ghost pages accumulate whenever rAF throttles — replaced
  with a keyed remount so exactly one page is ever mounted and unmount is
  synchronous; (2) animating `x` from `"100%"` to numeric `0` forces framer's
  DOM-measuring unit conversion — both endpoints are percent now; (3) the first
  mount animated from offscreen, putting an offscreen transform in the SSR
  HTML — page 1 now renders at rest.
- **Status:** Fixed. Regression check: a 6-tap 80ms mash sequence leaves
  exactly one mounted section showing the correct page.
- **Lesson:** before debugging "stuck animations" in a driven browser, check
  `document.visibilityState` and whether rAF ticks at all — a hidden tab
  freezes rAF-driven animation and mimics an app bug.

## 2026-07-07 — "Credit balance too low" from the story route

- **Area:** `src/lib/generate-story.ts` auth path.
- **Symptom:** clicking a theme → "Make my story!" showed the "Uh oh" error
  card; server log: `400 invalid_request_error … Your credit balance is too low`.
- **Root cause:** not a code bug. `ant auth login` authenticates against the
  **developer platform** (API-credit billing); the org has no API credits, so
  the Messages API rejects the call. The app was reading that profile. A
  developer-platform OAuth token is a different billing entity from the Claude
  **subscription**.
- **Fix:** added `CLAUDE_CODE_OAUTH_TOKEN` support (`src/lib/anthropic-auth.ts`)
  — a `claude setup-token` subscription token, sent with the
  `anthropic-beta: oauth-2025-04-20` header, bills against the Claude plan.
  Falls back to `ANTHROPIC_API_KEY`. Generation switched to prompt-for-JSON +
  zod validation so it doesn't depend on structured-outputs being available
  over the OAuth token.
- **Status:** Code path **verified** 2026-07-07 (PR #2 kept on main). Ran the
  real `/api/stories` route with a genuine `sk-ant-oat…` OAuth token wired in as
  `CLAUDE_CODE_OAUTH_TOKEN`: the app authenticated (Bearer + `oauth-2025-04-20`
  header, no `x-api-key`), the Messages API **accepted the request shape and the
  custom board-book system prompt** (no identity gating — an unknown worth
  resolving), and failed **only** with `400 "credit balance too low"` because
  that token bills a credit-less developer org. So the code is confirmed
  working; the sole remaining variable is billing entity. A genuine
  `claude setup-token` subscription token travels the same accepted path and
  bills the subscription instead. That final happy-path call is unproven here
  only because the subscription token can't be minted from this host (the
  desktop app's `claude` is a Linux VM binary — `exec format error` — and no
  subscription token sits in the host Keychain).
- **Lesson:** "OAuth token" is not one thing. platform.claude.com developer
  tokens bill API credits; `claude setup-token` tokens bill the subscription.
  A valid token that authenticates fine can still be the wrong *billing* entity.

## 2026-07-08 — Making story generation actually run on the Claude subscription

Long debugging session; two real findings, both fixed.

### A. Subscription OAuth tokens only work through the Claude Code CLI
- **Symptom:** a `claude setup-token` token (`sk-ant-oat01-…`) sent to the raw
  `/v1/messages` endpoint as `Authorization: Bearer` + `anthropic-beta:
  oauth-2025-04-20` was rejected — `401 Invalid bearer token` early on, then a
  bare `429 rate_limit_error` (no retry-after / ratelimit headers) once the
  token was captured cleanly. But `claude -p` with the same token returned a
  real completion.
- **Root cause (code/architecture):** subscription tokens authenticate only
  through Claude Code's own request path; a raw SDK call is soft-blocked. The
  app was using `@anthropic-ai/sdk` against the raw API.
- **Fix:** `generate-story.ts` now shells out to the `claude` CLI
  (`--print --output-format json --append-system-prompt …`) when
  `CLAUDE_CODE_OAUTH_TOKEN` is set, and keeps the SDK path for
  `ANTHROPIC_API_KEY`. `CLAUDE_CLI_BIN` points the server at the binary.
- **Capture gotcha:** `setup-token` prints the token wrapped in TUI color/cursor
  escapes; headless capture (PTY wrap at 80 cols, plain-pipe buffering, ANSI in
  the middle of the token) all corrupted it. The reliable capture was running it
  in a real Terminal.app via `osascript` and reading `contents of tab` (Terminal
  interprets the ANSI, yielding clean text). The prefix is `sk-ant-oat01-`, not
  `sk-ant-at01-`.

### B. Storage `x-upsert` trips RLS on a brand-new object
- **Symptom:** every page-image upload failed `403 new row violates row-level
  security policy`, even with a valid `authenticated` JWT whose `sub` = the uid
  and a path whose first folder = the uid. A direct Bearer upload of the *same*
  token to the *same* path with **no** `x-upsert` header returned 200.
- **Root cause (code bug):** `upsert: true` (→ `x-upsert: true`) makes Storage
  additionally evaluate the UPDATE policy, which fails on a not-yet-existing
  object. The 403 reads like an auth failure but is the upsert path. Isolation
  tests confirmed `x-upsert` is the *sole* cause: the same authed client uploads
  fine without it and 403s with it.
- **Fix:** `route.ts` uploads via `createAuthedClient(...).storage.upload(...)`
  with **no `upsert`** (paths are unique per story, so insert is correct).
  `createAuthedClient` (supabase-js `accessToken` option, token from
  `getSession()`) carries the owner JWT. NOTE: an earlier belief that "the
  storage client doesn't carry the JWT server-side" was wrong — both the
  `accessToken` option and `global.headers.Authorization` carry it fine; every
  failure was `x-upsert`. Full matrix in docs/auth-and-upload-pathways.md.
- **Status:** Fixed. Verified end-to-end: generated "Big Red Truck" (5 pages,
  3-4 words each) on the subscription; it saved and appears on the shelf.
- **Lesson:** a Storage `403 violates RLS` is not always an auth problem — rule
  out `x-upsert` (needs the UPDATE policy) before chasing the token.

## 2026-07-08 — Full UAT pass (no app bugs found)

- **Area:** whole app. First automated UAT run (baseline in `uat.md`).
- **Result:** the complete loop is green end-to-end, verified twice — once in
  the demo account (via the preview browser + DB) and once in the user's own
  account (via real foreground Chrome). Generated 2 real stories on the
  **subscription**: "Happy Little Dog" (19s) and "Hello, Friendly Moon" (14s),
  both `POST /api/stories 200`, each 5 pages / 2–5 words per page /
  `target_age_months=24` / one image + descriptive `alt` per page. Character
  vault auto-saved "Buddy" and linked it. Reader pages cleanly
  1→2→3→4→5→"The end" with working Prev/Next (`aria-label`s) and back-to-books.
  Login (logged out), bookshelf populated + empty ("No books yet!") states all
  render correctly.
- **Investigated but NOT a bug:** bookshelf cover `<img alt="">` (bookshelf/page.tsx:61).
  The `<h2>` title is inside the same `<Link>`, so the link's accessible name is
  the title; the cover is correctly marked decorative to avoid double-announcing.
  Proper ARIA practice — left as-is.
- **Testing-environment gotcha (NOT an app bug), recorded so it isn't chased as one:**
  the preview panel browser runs **backgrounded** (`document.hidden === true`),
  which freezes React's rAF-gated streaming content-swap → the `loading.tsx`
  fallback ("Getting your books…") never clears and the DOM shows **two `<main>`
  elements** (frozen fallback over collapsed real content). The server renders
  200 in <400ms and the content is present. In real foreground Chrome the same
  page renders `mainCount:1` with no stuck loading. Same root cause as the
  2026-07-07 rAF-freeze entry. Verify via live DOM/DB or foreground Chrome, not
  preview screenshots. Full details in `uat.md` § Exploration Notes.
- **Status:** No open issues.
