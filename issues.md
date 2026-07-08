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
- **Status:** Fixed in code; live subscription call is pending the user pasting
  a `setup-token` value (the `claude` CLI isn't reachable from the build
  sandbox, so it couldn't be minted/verified here).
- **Lesson:** "OAuth token" is not one thing. platform.claude.com developer
  tokens bill API credits; `claude setup-token` tokens bill the subscription.
  A valid token that authenticates fine can still be the wrong *billing* entity.
