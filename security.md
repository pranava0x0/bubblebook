# Security advisory log

Last updated: 2026-07-06

## 2026-07-06 — sweep before initial scaffold + npm install

Source: https://pranava0x0.github.io/vibe-coding-security/llms-ctx.txt

- **Next.js CVE-2026-44578** (unauthenticated SSRF in WebSocket upgrade handler,
  self-hosted deployments; patched in 15.5.18 / 16.2.6) → pinned `next@15.5.19`.
- Active campaigns checked against this dependency tree:
  - Miasma / Mini Shai-Hulud worm (TanStack, MCP, SAP ecosystems) — none in tree.
  - Phantom Gyp (`binding.gyp` bypass of `--ignore-scripts`) — no native addons
    here; installed with `--ignore-scripts` anyway.
  - Mastra AI namespace compromise (`easy-day-js` typosquat) — not used.
  - Rollup polyfill impersonation (July 2026) — no rollup tooling installed.
  - Nx Console VS Code extension, Trivy GitHub Actions backdoors — not used.
- No advisories for `zod`, `framer-motion`, `lucide-react`, `tailwindcss`,
  `vitest`, `@types/*`, `@supabase/*`, `ai`, `@ai-sdk/anthropic`.
- Cooldown applied: every pin was ≥7 days old at install time. Deliberately
  passed over fresher releases: `ai@7.0.16` (0.5d), `vitest@4.1.10` (0.8d),
  `@ai-sdk/anthropic@4.0.8` (2.8d), `lucide-react@1.23.0` (5.5d),
  `next@16.2.10` (5.2d), `@supabase/supabase-js@2.110.0` (6.6d),
  `framer-motion@12.42.2` (6.3d).
