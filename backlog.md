# Backlog

- **(high) Real illustration provider.** Placeholder SVG art ships by default;
  the OpenAI `gpt-image-1` path is wired but unverified against a live key.
  Before committing: verify contract/pricing/ToS per CLAUDE.md, then use each
  character's stored `look` for cross-story consistency. Consider caching
  generated character art on `characters.image_path`.
- **(high) Age dial.** Parent settings UI for `profiles.default_age_months` +
  a prompt ladder (18–36mo: 2–5 words; 3–4y: short sentences; 5y+: paragraphs,
  10 pages, quizzes). Schema already carries `target_age_months` per story.
- **(medium) Spend guard on /api/stories.** Per-user daily story cap counted on
  the stories table (fail closed) before the model call.
- **(medium) ESLint + CI.** `eslint-config-next`, then a PR workflow running
  typecheck + vitest + build (the same gate on pull_request, not just push).
- **(medium) PWA manifest + icons** so the app installs to a tablet home screen.
- **(low) Reader progress dots don't scale past ~8 pages** (PR #1 review): the
  age-ladder work that introduces 10-page stories needs a dot treatment or a
  page-count label for longer books.
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
