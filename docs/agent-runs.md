# Agent & workflow run scorecard

One row per subagent/workflow run — **filled in after every agent run** (see
AGENTS.md § Evaluate every agent run). Columns:
- **worked** — y/n, and *confirm the result was non-empty* (a fast/cheap finish usually means it failed).
- **quality** — were results correct/useful and did they survive verification against the code.
- **~tokens** — rough total across the run's agents.
- **tok/value** — tokens ÷ units of real value (verified findings, correct edits). The headline efficiency metric; flag > ~40K/useful-result.
- **failures → resolution** — what errored (rate-limit, empty return, schema-retry, dead finder) and how it was resolved.
- **resumed?** — if interrupted (network/rate-limit/timeout), did `resumeFromRunId` recover it, or was it re-paid.
- **hindsight** — the best-ROI alternative in retrospect.

| date | run | worked | quality | ~tokens | tok/value | failures → resolution | resumed? | hindsight |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-07 | 4-angle adversarial review workflow (find×4 → dedupe → verify) | no — all finders hit the session limit; returned empty-but-completed | n/a | ~510K subagent | ∞ (0 value) | session-limit kills returned empty-but-"completed"; not resolved — abandoned for an inline review | n/a — not attempted | Check remaining session budget before any late-session fan-out; the inline single-author review that replaced it produced 5 real findings for ~0 marginal tokens. Verify workflow results are non-empty before trusting them. |
| 2026-07-08 | 4-perspective PR review workflow (author/UX/web-dev/architect finders ×4 → synth) | partial — 4 finders returned 27 strong findings; the synth/consolidation agent stalled ~2min mid-run | high — ~20 real findings, all re-verified against the code; ~5 overstated/dupes, 1 verified not-a-bug (name_key already pre-trimmed) | ~9.5M gross (~3.5M effective; 6.7M was cache-read) | ~175K effective / useful finding — **far over the ~40K bar** | synth agent went silent ~2min (no file growth, mid-stream). Resolved by `TaskStop` + extracting the 4 finders' `StructuredOutput` from their `agent-*.jsonl` transcripts and doing the verify/dedup/disposition **inline** (I had already read the whole codebase) — no re-pay, no data lost. | Not via `resumeFromRunId` — inline consolidation from the cached finder outputs was cheaper and more reliable than re-running the fragile synth agent. | The 4-perspective fan-out was justified by the *explicit request*, but for a <500-line diff it's expensive; 2 finders (or an inline read) would surface most. **The consolidation/synth step is the fragile long-pole** — when the driver has already read the code, synthesize inline instead of delegating a big single-agent consolidation. Finder quality was excellent; the cost was the breadth + the stalled synth. |
