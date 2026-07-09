# UAT Baseline — Bubble Book

_Created: 2026-07-08_
_Last run: 2026-07-08_

## Project Info
- **Stack**: Next.js 15 (App Router, RSC), Tailwind v4, Supabase (DB/Auth/Storage), framer-motion. Toddler-facing, mobile/tablet-first.
- **Dev server**: `npm run dev` → http://localhost:3000 (preview config `bubble-book`, port 3000).
- **Entry point**: `src/app/page.tsx` (redirects to `/bookshelf`, or `/login` if unauth via `src/middleware.ts`).
- **Key routes**: `/` (307 redirect), `/login`, `/bookshelf`, `/create`, `/story/[id]`, `POST /api/stories` (generation), `/auth/callback`, `/auth/signout`.
- **Generation**: story text bills the **Claude subscription** by shelling out to the `claude` CLI (`CLAUDE_CODE_OAUTH_TOKEN`); images are deterministic keyless SVG placeholders (`src/lib/images.ts`). See `docs/auth-and-upload-pathways.md`.

## Critical Flows (run every time)
1. **Bookshelf loads**: `/bookshelf` → "My Books" header, New Story tile, book-cover grid (or "No books yet!" empty state). Covers link to `/story/[id]`.
2. **Login (logged out)**: `/login` → "Bubble Book" + tagline, email input, "Send me a magic link". Authed users are redirected off `/login` to `/bookshelf` by middleware.
3. **Create wizard**: `/create` → "Pick a story!", 8 theme tiles (dog/cat/truck/train/duck/moon/ball/bath) with `aria-pressed`, optional friends grid, "Make my story!" gated on ≥1 theme or friend.
4. **Generation (subscription)**: `POST /api/stories {themeKey}` → 200 `{id}` in ~15–20s. Produces a story with 3–5 pages, 2–5 words/page, one image per page, `target_age_months=24`, `status=ready`. Auto-saves any new characters to the vault and links them.
5. **Reader**: `/story/[id]` → starts at "Page 1 of N" (no progress persistence — always page 1), Prev/Next controls (`aria-label` "Previous page"/"Next page"), one large image + 2–5 word text per page, "The end" card at index N showing the title with a back-to-books link. Descriptive `alt` on the page image (derived from the image prompt).

## Sections & Last Tested
| Section | Last Tested | Notes |
|---------|-------------|-------|
| Bookshelf (populated) | 2026-07-08 | Stable — 4 demo books render + covers. |
| Bookshelf (empty state) | 2026-07-08 | Stable — "No books yet!" + New Story tile. |
| Login (logged out) | 2026-07-08 | Stable — magic-link form. |
| Create wizard | 2026-07-08 | Stable — SSR "Pick a story!", 8 themes. |
| Generation `/api/stories` | 2026-07-08 | Stable — 2 stories generated on subscription (19s, 14s), both 200. |
| Reader page-turns | 2026-07-08 | Stable — clean 1→2→3→4→5→end, back-to-books. |
| Character vault | 2026-07-08 | Stable — "Buddy" auto-saved + linked to its story. |

## Known Stable Areas
- Full create → generate → save → read loop (validated end-to-end in both the demo account and the user's own account).
- Subscription-billed generation via the `claude` CLI shell-out.
- Storage upload (no `x-upsert` — see issues.md 2026-07-08 B).
- Story schema (3–5 pages, 2–5 words/page) enforced by zod.

## Known Flaky / Unstable Areas
- **None in the app.** No open app bugs as of 2026-07-08.

## Exploration Notes
- **⚠️ Testing-environment gotcha (NOT an app bug):** the Claude **preview panel browser runs backgrounded** (`document.visibilityState === "hidden"`, `document.hidden === true`). React's streaming-SSR content-swap and framer-motion are rAF-gated, so in the preview the `loading.tsx` fallback ("Getting your books…") **never clears** and you see **two `<main>` elements** (frozen fallback on top, real content collapsed to 0px behind). The server renders fine (200 in <400ms) and the real content is in the DOM. **Do not chase this as a bug.** Verify via: (a) the **live DOM / DB**, not screenshots; or (b) the user's **real foreground Chrome** via `osascript ... execute javascript`, where the same page renders cleanly (`mainCount:1`, no stuck loading). Same root cause as issues.md 2026-07-07 (rAF freeze in a driven/hidden tab).
- **Generation is the real server pipeline** and is session-cookie-driven, so it works regardless of the client tab's visibility — POST `/api/stories` directly and inspect the DB (`stories`/`pages`/`characters`) for authoritative verification.
- **⚠️ Correction (2026-07-08): the user's Chrome, when *driven from the terminal*, is also backgrounded** — `activate` doesn't hold it foreground (the terminal/Claude app steals focus back), so it reports `visibilityState:hidden` and **won't hydrate**: SSR content reads fine (`textContent` shows the page), but `__reactFiber` is absent and clicks/keyboard do nothing. So note (b) above only holds for *SSR content reads*, not interactivity. **The reliable client-interactivity check is the preview browser** (headless, we own it — it hydrated `/login` and held a filled input on the same build the driven Chrome couldn't). For the generation loop, the server pipeline + DB is authoritative regardless of any tab's visibility.
- **osascript automation caveat:** AppleScript `execute javascript` does not await Promises, and rapid discrete click+read calls interleave with framer-motion's tween timing → erratic reads (e.g. a reader appearing to "start on page 4"). Drive multi-step UI flows with a **single page-side `async` function that awaits between steps and writes results to `window`**, then read that — don't step with per-click `delay`s. Also: AppleScript reserved words `before`/`after`/`done` as `set` vars throw "Expected expression" (use `s1`/`s2`); `innerText` omits `sr-only` + off-viewport text, so read the reader's page counter with `textContent`.
- Test viewport this run: mobile 375×812 (primary toddler form factor).
- Two test stories left in place: "Happy Little Dog" (demo account) and "Hello, Friendly Moon" (user's account — a genuine starter book, intentionally kept).

## Suggested next-run exploration
- Multi-friend selection in the wizard (pick 2–3 characters, confirm they appear together in the story).
- Rapid double-tap on "Make my story!" (guard against double-submit / double-generation).
- Swipe-drag page turns on touch (the reader has an `onDragEnd` handler) vs. button taps.
- A story whose generation returns exactly 3 pages (min) and one at 5 (max) — confirm the counter and dots render both ends.
- Reader "The end" → back-to-books link returns to a correctly-updated shelf.
