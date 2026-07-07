# Agent & workflow run scorecard

One row per subagent/workflow run. Columns: what it did · worked · quality ·
~tokens · better-ROI alternative in hindsight.

| date | run | worked | quality | ~tokens | hindsight |
| --- | --- | --- | --- | --- | --- |
| 2026-07-07 | 4-angle adversarial review workflow (find×4 → dedupe → verify) | no — all finders hit the session limit; returned empty-but-completed | n/a | ~510K subagent | Check remaining session budget before any late-session fan-out; the inline single-author review that replaced it produced 5 real findings for ~0 marginal tokens. Verify workflow results are non-empty before trusting them. |
