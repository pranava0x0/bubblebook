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
