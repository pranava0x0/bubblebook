# AGENTS.md: How to work in these repos as an AI agent

> Base file for every project in this folder. Project-specific `AGENTS.md` files extend this with file maps, settings keys, and project-specific conflict cheatsheets. When project conflicts with base, project wins. It's the local source of truth.
>
> Companion files: [CLAUDE.md](CLAUDE.md) is the *what* (principles, architecture, editorial rules); [DESIGN.md](DESIGN.md) is the *look*.

---

## Read these first, in order

Before touching code, read:

1. **[CLAUDE.md](CLAUDE.md)**: universal principles + project-specific intent and editorial rules. The "Project intent" and any project-specific notes are load-bearing for every change.
2. **[DESIGN.md](DESIGN.md)**: visual + content system. Touch this before changing how data is presented.
3. **`backlog.md`** (or `BACKLOG.md`): what's next. Pick from here; don't invent work.
4. **`issues.md`**: what's broken. Check before reporting a bug as new.
5. **`security.md`**: supply-chain advisory log. **Refresh if `Last updated` is > 7 days old before any `npm install` / `pip install` / dep upgrade.** Also fetch `https://pranava0x0.github.io/vibe-coding-security/llms-ctx.txt` and surface any matching advisory before suggesting an install.

---

## The Explore → Plan → Code → Verify loop

Documented in detail in [CLAUDE.md](CLAUDE.md). Concretely inside any repo:

- **Explore.** Use `grep`, `find`, or an Explore agent to find relevant code. Most projects here are small enough that a single read of the main module + the data schema covers ~80% of the surface.
- **Plan.** For anything beyond a one-line fix, present 2–3 approaches with pros/cons before writing code. Changes that touch the data schema, the editorial rules, or the visual identity ALWAYS need a plan surface. They reshape the product.
- **Code.** Edit existing files first; only create new files when the task genuinely requires it. No new helpers for one-shot operations. For any non-trivial rule or logic, write the spec in prose first (trigger, inputs, mechanism, success criteria) then implement against it.
- **Verify.** Run the test suite. Use the feature in a browser (or invoke the CLI) before declaring done.

**Research budget.** Web searches and multi-source fetches cost 20–50K tokens and minutes of wall-clock; most coding questions are answerable from the repo in seconds. Work through this ladder before going online:

1. `grep` / `find` in the repo.
2. Read the file(s) that showed up.
3. One targeted WebFetch if the local code points to an external spec (a library's changelog, an API schema, a referenced RFC).
4. If still stuck, state the specific gap and ask. Don't run a broad web sweep.

Reserve deep web research for tasks the user explicitly frames as research. Don't spawn multi-source research agents (WebSearch + multiple WebFetch + synthesis) for tasks that are answerable from the codebase. If you find yourself fetching more than 2–3 URLs for a single coding task, stop and ask.

**Per-item cadence in multi-item sessions.** Surface design questions up front, then do **tests + docs + commit per item**, not batched at the end. Catches issues early and produces a clean bisect history.

---

## Token economy

The context is RAM, and every tool result is re-fed on every later turn. Cheap habits compound:

- **Inline before subagent.** A subagent costs ~5–40K tokens of overhead; don't spawn one to grasp a small project's structure or do a bounded lookup. 1–2 targeted `grep` / `node -e` / `WebSearch` calls beat it. Spawn only for 10+-file exploration or synthesis.
- **If a `grep`/`find` you just ran already resolved the exact file list, there's no exploration left to delegate — read them yourself.** The tell is a prompt shaped like "based on the search above, also check X"; that's a Read call, not an agent. Spawning N agents to each read a handful of already-located files multiplies orchestration overhead (~25–40K tokens each) for zero added discovery, and a rate-limit error on one doesn't mean it died — relaunching before confirming that risks paying for the same extraction twice.
- **For "where is X?" on a greppable codebase, grep first.** A literal `grep -rn` is *exhaustive* where a semantic Explore run silently misses call sites (one missed a downstream re-sort a grep would have caught). Don't send an agent to analyze data you already control (your own JSON/CSV/code). Inline `grep` + a Python one-liner is faster, cheaper (~1–2K vs ~30K), more exhaustive, and iterable where a frozen agent snapshot isn't.
- **A library beats an agent for deterministic extraction.** Pulling text from a text-layer PDF, parsing a structured file, reshaping data: that's a PyMuPDF/`fitz` or parser job, not an agent job. An agent transcription is slower, costlier, and non-reproducible: one such run burned ~974K tokens and hit the session limit for *zero* output, where the library did it in ~2s for 0 tokens. Spend agent tokens only on judgement (classify, summarize, decide). (See [CLAUDE.md → AI / API cost optimization](CLAUDE.md).)
- **Verify a subagent's "complete" list against a grep before acting on it for mechanical changes.** Agents report what they *noticed*; grep reports what *exists*. For every-call-site / every-reference edits, the agent's list is a lead, not a guarantee.
- **Model-select per subagent.** Simple gathering (grep, file listing, schema validation) → `model: "haiku"` (~20× cheaper). Multi-source synthesis (web research, code review, gap analysis) → Sonnet. Reserve Opus for genuinely open-ended work where Sonnet visibly underperforms.
- **Every spawn prompt carries a scope limiter.** At least one of: "report in under N words," "no more than N web searches," "read only the N most relevant files," "return the top N." Without one, Explore reads every file and a web agent fetches 20+ full pages. Default Explore breadth to `"quick"`, not `"very thorough"`.
- **Cap fan-out width to 2 concurrent agents without asking.** A wide burst of parallel calls (8-10+) triggers server-side rate-limit errors that masquerade as task failures and invite wasteful retries that duplicate work if the call was still running. Prefer 2-3 large-batch agents over many items to one agent per item. Never ask "should I fan out to 8?"—it's always "2 concurrent, or what's the specific reason this needs 3+"? Confirm a call is truly dead (not just slow) before relaunching it.
- **Spend down a token budget out loud.** At ~50K tokens consumed in a single turn, pause and offer proceed / scope-down / abort rather than silently burning the budget.
- **WebSearch snippets usually suffice.** For "search X and add it," the snippet typically carries every field. WebFetch only for a missing field, never secondary analysis; cap at one fetch per entity.
- **Read the slice, not the file.** `grep -n` + `offset`/`limit` over whole large files; when N files share a structure, read one representative.
- **Suppress verbose output by default.** Pipe noisy scripts to `tail` / a summary; read full only on failure. A re-run re-injects the entire output. Validate inputs before triggering, don't recover after.
- **Check enum/ID constraints before writing.** Look up the live allowed `category` / `theme` / enum set first; an invalid value forces a fix-and-re-commit loop. Never guess enums from memory.
- **Don't read background-agent transcript files.** Use the completion-notification result, not the raw `tasks/*.output` JSONL. Reading the transcript dumps the whole agent run into your context.
- **Confirm work isn't already done before re-running.** After a context reset, check that a research file / agent result doesn't already exist before re-spawning; re-running completed agents silently burns 50–70K tokens.

---

## Running research & multi-agent fan-outs

Reserve fan-outs for genuinely open-ended research (see [CLAUDE.md → Working with AI agents](CLAUDE.md) for whether the task needs one at all). When it does, these rules keep the run cheap and the results clean:

- **Size to the shelf.** Ask for exactly the N records the destination surface holds, ranked. Never "find as many as possible." A specified count makes the agent stop instead of over/undershooting.
- **Partition entities across agents.** Each entity (person/org/sector) belongs to exactly one agent; hand each a "covered elsewhere, skip" list. Cross-agent duplicates are a partitioning failure, not a dedupe chore.
- **Seed then spawn.** Fix the JSON contract (field names, id shapes, enums, edge cases) with cheap inline searches first, then bake it into each agent prompt. Debugging a schema across N live agents costs N×; proving it once inline yields zero parse/retry loops.
- **Pre-flight the agent's premise against your own data before spawning.** A ~1-minute local `grep` can disprove the hypothesis a finder agent would be launched on. One run burned ~85K tokens chasing a format assumption a local grep contradicted (it returned `[]` *and* contradicted the project's own working parser). Check the cheap local signal first; it's near-free.
- **Batch research agents by breadth, not by unit.** One agent covering 8–10 entities/states beats eight single-entity agents. Each agent re-loads the system prompt + tool schemas. Sequence agents only when a prior result genuinely informs the next direction; don't fan out in parallel "to be thorough."
- **Record exhausted / walled seams durably** (backlog + a `data-sources.md`) so no future session re-spends an agent re-confirming the same dead end. A confirmed-negative is a real deliverable. Note *why* each seam is dead ("corpus X exhausted," "host Y 403s scripts → browser-capture only," "source Z is image-only scans → needs OCR"), and distinguish a closeable gap from a permanent source-side dead-end.
- **Validator bar + early bail as a hard prompt constraint.** Put required fields in the prompt with "2 searches without them → return `skip: true`," or agents grind on unfindable records and return junk rows.
- **Agents write to disk, return a summary: non-negotiable.** Subagents are isolated per spawn, so research an agent doesn't write is *irrecoverable* once it returns. Require it to Write JSON to `data/research/`, verify the file landed, and return just path + count + 2–3 surprises (~100 tokens); embedded JSON blobs bloat the orchestrator and aren't auditable. An **"export the prior agent's data" task is a smell**. A fresh agent never had it either, so you only re-research from scratch (one case wasted ~180K tokens; ~40% of research tokens go to this). The bug is upstream: the original prompt didn't write. Agents return *candidates*; integration, cross-record linking, and commits happen in the main session.
- **A `Workflow` agent's result is in-band. Checkpoint before returning.** Its output *is* the return value, so a connection drop or terminal error mid-run loses the **entire** result (one biologics-research agent died exactly this way). Have long agents Write progress to disk as they go, and resume a killed run by `runId` (the unchanged-prefix cache replays completed `agent()` calls for free) rather than restarting from zero.
- **Cap sources at 2 per claim** at collection time; deeper citation chains are a separate curation pass.
- **Spell out the output contract:** plain UTF-8 (no HTML entities), omit conditional keys rather than emit empty strings, "your final message is parsed, not read," "cite only URLs you fetched" (else agents cite snippets, ~5% dead). Updating records? Paste the exact ids to echo back. Prose gets invented slugs back.
- **Cap search angles (~6) and give a stop rule** ("stop after N verified items, or 2 consecutive angles surface nothing new"). Breadth of angles, not result count, drives waste. 12+ angles cost ~2.7× for identical quality.
- **The final report states absences, not just hits**: what it found, what it couldn't verify, and what it deliberately excluded. A report that lists only successes hides coverage gaps.
- **Strip three recurring defects on integration:** placeholder/empty fields (recover from the source URL or drop the row), cross-agent duplicates (dedupe, pick one category deliberately), and prose contamination (agents prepend "All verifications complete…" despite instructions, drop non-data lines).

---

## Evaluate every agent run

When a subagent/background task returns, do a 30-second retrospective before consuming the result:

- **Reason**: was an agent right, or would 2–3 inline `grep`/Python calls have done it?
- **Cost**: flag anything over ~40K tokens per useful result.
- **Result**: used downstream or wasted? Did it survive verification (grep the "complete" list, confirm the result isn't empty)?
- **One improvement**: fold the lesson into a *file* (prompt template, `data-sources.md` dead-seam note, backlog entry), not just this reply. If the correction applies to the next run, it doesn't belong only in your head.

A solo turn with no spawn has nothing to evaluate. Say so rather than invent analysis.

**Persist the retrospective, don't just perform it.** Keep a running `docs/agent-runs.md` scorecard in the repo and append one row per agent/workflow run: what it did, worked (y/n), quality, ~tokens, and the best-ROI alternative in hindsight. Three separate projects converged on this exact mechanism independently in the same week — that's a signal it's the right default, not a one-off. The point isn't the retrospective (already required above); it's that a retrospective only kept in the reply is invisible to the next session, so the same mistake gets re-paid for.

---

## Verifying changes

Default verification matrix (project-specific `AGENTS.md` should override with concrete commands):

| Change kind                    | Run                                                  |
| ------------------------------ | ---------------------------------------------------- |
| Schema edit                    | Schema-validation tests (Pydantic / zod / etc.)       |
| Seed / data edit               | Refresh script + data-integrity tests                 |
| Shared vocabulary change       | Match-frontend-to-backend test                        |
| Frontend (markup / styles / JS) | E2E / Playwright suite, or manual UAT in browser     |
| Connector / fetcher            | Connector unit tests + a small live integration run  |
| Dependency install / upgrade   | Advisory sweep + lockfile diff + full build/test      |
| Design tokens / styles         | Contrast + visible-focus check at mobile and desktop  |
| Anything substantial           | Full test suite (`pytest` / `npm test` / `vitest`)   |

**Narrowest meaningful test first, then broaden.** Run the test closest to the change for the fast loop; escalate to the full suite only when the change has cross-cutting risk. Don't pay full-suite latency on every iteration, and don't skip it before declaring a substantial change done.

**For UI changes**, also run the app locally and click through the affected views. Type checks and unit tests verify code correctness, not feature correctness. Two screenshots, 375×812 and 1280×800, settle a UI fix; more than that is token waste unless the change is genuinely complex.

**For data changes**, diff the canonical output (`docs/data/*.json` or equivalent) and skim the diff before committing. A 30-second skim catches regressions tests miss (especially around character encoding, pretty-printer drift, and unintended fields).

**Never use an agent to review a live UI.** Static-analysis agents read HTML/JS but can't start a server or run JavaScript. They give confidently wrong answers about dynamic behavior (declaring a working JS-rendered feature "dead"). Use `preview_eval` / `preview_snapshot` / `preview_screenshot` directly: faster, ~3K vs ~40K tokens, and actually correct.

**DOM-count before screenshot.** For any DOM-rendering change, make a ~100-token element count (`querySelectorAll('.x').length` via `preview_eval`) the *first* verification step. It catches blank-because-scrolled viewports and stale-cached-JS that screenshots and unit tests miss. Screenshot only once the count is right, and **reload the preview after a rebuild** first. An open tab shows stale data until reloaded.

**Screenshot and resize tools have their own blind spots — don't take a tool's output as ground truth without a second signal.** A screenshot may only render the top of the viewport at scroll position 0; a blank capture at a non-zero scroll position is often the tool, not the page — verify below-the-fold content with a DOM-count or accessibility snapshot instead. A viewport-resize tool can silently floor out (some won't actually shrink below ~1300px even when told to emulate mobile) and report success anyway — verify mobile CSS via code + computed-style inspection when a "mobile passed" result seems suspicious.

**Check the tablet breakpoint first when verifying responsive changes across viewports.** Regressions tend to surface there before mobile or desktop.

**Run a build/codegen script twice to assert idempotency**. The second run must inject identical bytes.

**Query test text by its closest block wrapper, not a full-sentence regex, when the text can contain nested markup.** `getByText(/full sentence/)` silently fails to match when inline tags (`<b>`/`<strong>`) split the sentence into multiple text nodes. Select the closest block (`.closest('li')`) and assert with `.toHaveTextContent(regex)`, which aggregates all child text.

**Spot-check source URLs by status** before committing externally-sourced records: `curl -s -o /dev/null -w "%{http_code}" -L -A "Mozilla/5.0..." <url>`. A 403 (bot-blocker) is inconclusive: keep it; a 404 is dead: drop or replace.

**To verify a fail-loud external pipeline, boot it twice.** Run it in real mode (no credentials) to watch it fail with the exact reason and expose the error/retry UI, then flip the project's dry-run flag and re-run to watch the happy path complete without external calls. One boot only ever shows half the behavior. Prove a resumable retry by re-running the same record and asserting no duplicate is created (count unchanged) and no external call re-fires.

**Seed the time-series before verifying a visualization that reads it.** A sparkline or chart backed by an append-only history table renders empty until at least two observations exist; trigger the ingest (hit the refresh/sweep endpoint N times) before screenshotting, or you can't tell "feature broken" from "no data yet." Read the API payload directly to confirm the series is populated, then check the UI.

---

## Common tasks

### Adding a record / claim / row (most common)

1. Open the seed file (typically `data/seed/<entity>.json` or equivalent).
2. Append one record with: stable `id`, real `source_url`, verbatim content, today's `captured_at`, and any required category from the canonical list in the schema module.
3. Run the refresh script (validates + writes the build output).
4. Run the relevant data-integrity test to confirm.
5. Commit. Seed JSON and build output `data/*.json` move together, never in separate commits, or a future bisect lands on a broken state.

### Adding a feature

1. Confirm it's on `backlog.md`. If not, propose adding it before building.
2. Sketch the smallest version that closes the user need end-to-end.
3. Build that. Add tests alongside. Use the feature in the browser / CLI.
4. Commit at the natural boundary (per module, per fix, per doc update).

### Adding a new vocabulary item (theme, category, tier)

This is a schema change. **Don't do this casually.** Steps:

1. File a `backlog.md` entry first explaining the gap.
2. Add to the canonical constant in the schema module.
3. Mirror in any frontend mirror constant (the test that asserts parity catches drift here).
4. Add any color / icon / label token to the design system (light + dark variants).
5. Migrate any existing records that should map to the new entry, or intentionally leave them.
6. Run the full test suite. Drift-safety tests should catch a missed mirror.

### Adding a connector (per-source scraper)

1. Subclass the project's `Connector` base class.
2. Register in the connector index module.
3. Implement `fetch_records()` / `normalize()` / `cache_key()`.
4. Set `run_order` so enrichment connectors run *after* their producers.
5. Schema-validate emitted records; tests catch any new field that the schema's `extra="forbid"` would reject.

### Running an auditable LLM analysis over a corpus

For a corpus of comments / filings / documents, decompose — don't one-shot (rationale in [CLAUDE.md → AI / API cost optimization](CLAUDE.md)):

1. **Cheap deterministic pass first.** Keyword-tag each item against the controlled vocabularies — this is the prior, the cross-check, and the main cost lever.
2. **Per item, one subagent:** chunk → extract verbatim quotes (tight spans, one sentence or a clause — they dodge `--- PAGE N ---` splices that drop verbatim-coverage below threshold) → bin the quotes → name + describe + stance each bin. Force strict JSON to a committed schema; write one file per item under the source tree.
3. **Validate.** Verbatim-quote check (normalize whitespace; tolerate footnote/page-marker splices), schema + bin/quote-ref integrity. Stamp `verified_at` — the LLM pass is provisional until audited.
4. **Each worker self-loads its row** from a committed work-list (`node -e "…find(r=>r.acc===…)"`) instead of the orchestrator transcribing hundreds of rows into `args` — the script has no filesystem access, and an LLM re-emitting the list drops rows.
5. **Gate the independent audit on a deterministic flag**, not blanket: lens-divergence from the keyword prior, zero/thin quotes, all-neutral stance. Only ~15–25% need a fresh skeptic. A blanket audit was ~45% of tokens for a 1-in-6 catch rate.
6. **Run a style/boilerplate linter** (AI-register words, em-dashes, caption/signature quotes) as a code check before any LLM audit — it catches the most common audit finding for free. Each deterministic check subtracts from what an LLM audit must do.
7. **Stamp the true model** in a `provenance.model` field per item. A system-prompt model override doesn't guarantee which model ran; stamp the real one from the API response.

### Reviewing your own PR

To review code you wrote, spawn independent reviewer agents with distinct lenses (a correctness/logic pass, a silent-failure/error-handling pass) rather than re-reading it yourself; author bias skips the same lines twice. Give each the exact diff scope (`git diff main...HEAD`), the highest-risk files, and "report findings, don't fix." They read the committed diff, so you can keep editing your working tree while they run.

Then critically evaluate every finding before applying it: a suggested fix can be wrong for the context. One reviewer proposed word-boundary matching for a content-safety filter, which would have weakened the gate (`\bporn\b` misses "Pornhub"), so the right move was to keep substring matching and document why, not apply the suggestion. Log confirmed bugs (root cause, fix, commit, regression test) in `issues.md`; that file is what the review is for.

### Ingesting a source's structured API (not just its PDFs)

When an authority publishes a data service alongside its documents, ingest the service: it's reproducible and versioned where a scraped PDF isn't.

1. **Find the real endpoint.** Fetch the service's own help/index and read the URL template off it. Don't trust a documented or guessed path.
2. **Fetch rate-limited and host-allowlisted**, same network ethics as any scraper.
3. **Cache the raw response and commit it** (small XML/JSON is the evidence) next to the parsed output. A test re-parses the committed raw bytes and asserts the derived output matches, so the repo self-verifies offline. Support an offline re-parse mode that preserves the original fetch date.
4. **Label the frame.** API totals are frequently a different frame from figures already shipped elsewhere (e.g. all-funds vs. general-fund). Store them labeled, never sum across frames, and watch for hierarchical rows that double-count (a total that already contains its children); see [CLAUDE.md → Data handling](CLAUDE.md).
5. **Confirm the stage in the authoritative index before asserting it** (e.g. don't call a bill "enacted" unless the index actually lists that stage).

### Handling PR review comments

A PR in **"COMMENTED"** state means action required, not FYI. Fetch full review bodies (not the summary line), treat any user-provided link as authoritative, extract a checklist of each distinct issue, and verify the specific flow each names, not just the happy path. The merge is the start of addressing feedback, not the end.

### Driving a browser to scrape (Chrome / Playwright MCP)

Concrete gotchas that aren't obvious until you hit them:

- **No top-level `await` in `javascript_tool`**. Wrap calls in an async IIFE.
- **`window` globals don't survive a cross-domain navigation**. Stash state in `localStorage`.
- **A selector inside a `[hidden]` container needs `state="attached"`**, not the default `state="visible"`. `display:none` removes the element from the box model, so a visibility wait times out.
- **Auth differs per source**. Some need a logged-in browser session first; public APIs don't. Note the requirement per source in the project `AGENTS.md`.
- **Bulk file downloads via hidden iframes require the host's *automatic downloads* permission** (Chrome: `chrome://settings/content/automaticDownloads`). Without it an iframe `a.click()` silently succeeds but nothing lands — Chrome's multiple-download protection blocks it. Keep the worker pool small (2–3): concurrent SPA bootstraps starve the renderer and ~25–30% miss the render-wait; retry at lower concurrency, then a single-worker pass for the tail.
- **Two gov-portal filename quirks corrupt downloads silently.** A `;` in the filename is truncated at the `Content-Disposition` separator (losing the extension — heal from the PDF magic bytes). Some portals append a `" *"` marker to link labels (strip it before an extension match). Afterwards, validate against the corpus *inventory* — every inventoried item has a body on disk with real extracted text — not against a count. A clean count is not a clean corpus.
- **A tool's output filter can block a full JSON/base64 blob just because it contains URL-like fields**, reading it as a possible exfiltration attempt. Use a two-phase pattern instead: return lightweight metadata first, reconstruct the full payload in a second pass.
- **The Wayback Machine replays raw gzip bytes without a matching `Content-Encoding` header.** `curl --compressed` silently fails to decode a snapshot; fetch the raw snapshot (the `…id_/` URL modifier) and gzip-decompress it yourself.

---

## What NOT to do

- **Don't paraphrase quoted content.** Quote verbatim into the `statement` / `quote` / `body` field. Tests catch obvious markers ("they claim that…").
- **Don't cite auto-caption transcripts with the same confidence as written quotes.** Label spoken quotes explicitly ("spoken · auto-caption") and distinguish them from written quotes in both the UI and the data. Auto-captions are machine transcriptions, inherently approximate.
- **Don't write product copy in the AI register.** Headings, button labels, microcopy, empty states, and any prose that ships avoid the model tells: *delve / leverage / seamless / robust*, "it's worth noting that", marketing vapor, rule-of-three padding, hollow summaries. Plain, specific, human: lead with a number or a name, short declaratives, no ceremony. Full list in [DESIGN.md § 11.1](DESIGN.md).
- **Don't add a record without a real `source_url`.** Schema rejects it; reviewers reject it harder.
- **Don't LLM-classify subjective editorial calls.** Stance, sentiment, framing: these are curator-only. A wrong tag undermines the whole product.
- **Don't aggregate to a "trust score" / "credibility index" / "greenwashing score."** Show the data; let users judge.
- **Don't introduce a new framework / library / build tool** mid-project. If the stack is vanilla JS + Pydantic + Playwright, stay there. Adding React / Vue / Svelte / Webpack contradicts the static-first principle and adds maintenance debt the project doesn't pay back.
- **Don't touch `docs/data/*.json` (or equivalent build output) directly.** Edit the seed and re-run the refresh script.
- **Don't push scraper / refresh output straight to `main`.** When the output shape is ambiguous, malformed rows can pass schema validation and still ship. Route the output through a branch + PR so a human prunes before merge. Schema validation is necessary, not sufficient.
- **Don't run credential-scoped pipelines in CI.** When the data path is authenticated with the user's session cookies or personal tokens, the refresh runs locally via a skill, never in CI, where the blast radius of a leaked credential is too large. Document why in the project `AGENTS.md`.
- **Don't expand scope inside a fix.** A bug fix doesn't need surrounding cleanup; a one-shot operation doesn't need a helper. Note future cleanup in `backlog.md` and move on.
- **Don't loosen invariants quietly.** If a rule has a test guarding it, that test was written because someone got burned. Read the rationale before relaxing it.
- **Don't `--no-verify` to bypass a hook.** Fix the underlying issue. Hooks exist because someone got burned.
- **Don't hand-roll a process waiter.** Launch long jobs with `run_in_background` and wait for the completion notification. `pgrep -f "<module>"` self-matches the waiter's own command line, so an `until pgrep` loop never exits. If you must poll, match the real invocation or capture the PID, or use a Monitor tool.
- **Don't trust `git add` on a gitignored output dir.** It skips brand-new files under a gitignored path. They bake into the site but never commit, so a fresh clone misses them. `git add -f` new records and test that every baked record is tracked.
- **Don't add yourself as a co-author or leave a machine fingerprint.** Never include `Co-Authored-By:` for any AI agent in commit messages (not Claude, Copilot, or any other tool) and no "🤖 Generated with…" footers or tool-attribution lines in commits or PR descriptions. Commits are owned by the human who reviews and ships the work. Write the message in their plain voice (what + why), not the generic-assistant register. The `claude.coauthor` git config is set to `false` in these repos; honor it.
- **Don't treat an empty result as a failure (or a failure as empty).** A legitimately empty collection renders as an explicit "none" state; an extraction/parse failure is a bug to log in `issues.md`. Conflating them hides coverage gaps. See [CLAUDE.md → Data handling](CLAUDE.md).
- **Don't invent history for a missing file.** If a referenced `backlog.md` / `issues.md` / `security.md` isn't there, don't fabricate prior entries. Create the file only when the task calls for it.

---

## Repo norms

- **Read before edit.** Always. Even if you read the file earlier in this session.
- **Type hints on every Python function.** No `any` in TypeScript.
- **No `print()` for runtime output**. Use the `logging` module.
- **Test alongside code, not after.**
- **Commit at natural checkpoints**: per-feature, per-bug-fix, per-doc-update. Small, focused commits over large monolithic ones.
- **Touch targets ≥ 44px on touch** — gate on `@media (pointer: coarse)` so desktop inline controls don't bloat (see [DESIGN.md § 12](DESIGN.md) pitfall).
- **Mobile first.** If you change UI, resize the preview to 375×812 (iPhone SE) and verify before declaring done.
- **No API keys in code, ever.** Read from environment variables; halt with a clear error if missing.
- **System fonts by default.** No Google Fonts link without explicit justification (see [DESIGN.md § 2](DESIGN.md)).
- **Don't assume a port is free. Probe before binding.** Many projects run concurrently here; starting on an occupied port silently connects to the *wrong* service. Probe first, use an alternate port, and revert any temp port change before committing. For a scheduled/unattended job specifically, pin an uncommon port explicitly (a stale process from a different project can silently squat the default with no human present to notice), or prefer a static-serve fallback (`serve out/`, no compile step) over a dev server that's more port-sensitive.
- **`toLocaleDateString('sv')` gives a clean local-timezone `YYYY-MM-DD` string.** `new Date().toISOString().slice(0,10)` is always UTC, so a build near midnight in a US timezone can show tomorrow's date; the Swedish-locale format is ISO-shaped but computed in local time, no date library needed.
- **Disable the Bash sandbox for vitest / dev-server / `localhost` calls.** The default sandbox blocks loopback IPC. Test runners hang then fail with cryptic fetch timeouts ("no tests"), and `curl localhost` returns HTTP 000. Set `dangerouslyDisableSandbox: true` for those specific calls.
- **A project-root `design.md` collides with the base `DESIGN.md` on a case-insensitive filesystem (macOS default).** Nest the project override in a subdirectory (e.g. `docs/design.md`) to avoid a silent overwrite.
- **Claude Code's embedded CLI binary doesn't inherit Full Disk Access granted to `Claude.app`**, and its path changes per update so a manual TCC grant is fragile. Dispatch privileged local-data commands (iMessage/Contacts DB access) to `Terminal.app` via `osascript`, which does have FDA.
- **A vendor free tier can auto-pause after ~1 week idle** (e.g. Supabase), causing DNS/connection failures that read exactly like a code bug. Check the dashboard before debugging code when a previously-working integration suddenly can't connect.
- **Next.js 16 forbids `revalidatePath()` / `revalidateTag()` during render.** A "check expiry and update" pattern inside a server component's render path crashes; route that write through a Server Action or a client-triggered call instead.
- **A PaaS build environment often can't reach a service's private/internal network.** A DB migration or seed step that runs at build time (e.g. on Railway) needs the public proxy URL explicitly, even though the app uses the internal URL at runtime.
- **Delete a feature branch (local + remote) right after a successful merge. Don't ask.** The merge is the signal it's done; skip the friction prompt. Exception: don't auto-delete if the merge had to be reverted.

---

## Escalate to a human when…

- The editorial frame would change (e.g. adding a new theme / category, changing the rubric for a subjective field, adding a new entity to the in-scope set).
- A subjective call is contested and you're unsure (stance tags, content categorization, what counts as a primary source).
- A canonical source URL starts 404'ing or paywalls. Pause before switching to a less-canonical source.
- Schema fields would change in a way that cross-cuts seed + frontend + tests + connectors. Sketch the migration plan in a `docs/` file first.
- The user says "ship it" but a test is still failing for unrelated-looking reasons. Surface the failure, don't silently skip.
- A "scar tissue" pitfall in [DESIGN.md § 12](DESIGN.md) seems wrong for the current task. The pitfalls exist because someone hit them; verify the rationale doesn't apply before relaxing the rule.

---

## Cross-project hygiene

Working in this folder means the user may run many small projects in parallel.

- **Stay within the current project's scope.** Don't open files from a sibling project unless the user explicitly asks. The folder-level `backlog.md` is portfolio work, not a substitute for the project's own `backlog.md`.
- **Each project's `security.md` is independent.** Refreshing one doesn't refresh the others.
- **Each project's tests are independent.** Don't infer test status across projects.

---

## When something unexpected happens

Add a concise note to the project's CLAUDE.md or `issues.md`. The pattern is:

1. **What I expected:** one sentence.
2. **What happened:** one sentence.
3. **Why:** one sentence (root cause, not symptom).
4. **What to do next time:** one sentence (the actionable lesson).

The note grows the project's scar tissue. The next agent (or you, a month from now) avoids the same hour-long detour.

That growth, files getting *slightly* more specific with each session's surprises, is the asset. Don't rewrite from scratch; append.

---

## Project notes — Bubble Book (living; append, don't rewrite)

- **Verify commands:** `npm run typecheck && npm test && npm run build`. UI:
  `preview_start` config `bubble-book` (port 3000), then screenshot at 375px.
- **Anthropic auth:** the app constructs a zero-arg official-SDK client, so the
  credential chain is `ANTHROPIC_API_KEY` → `ant auth login` OAuth profile
  (`~/.config/anthropic/`). This machine has **no Homebrew**; install CLIs into
  `~/.local/bin` (first on PATH). `ant` came from the official
  anthropics/anthropic-cli GitHub release — note the assets are
  `ant_<v>_macos_arm64.zip`, not the `darwin_*.tar.gz` some docs suggest.
- **Driven-browser UAT trap:** the preview tab is frequently *backgrounded* —
  `document.visibilityState === "hidden"`, zero rAF ticks — which freezes all
  rAF-driven animation at its first frame and perfectly mimics an app bug.
  Check visibility/rAF before debugging "stuck animations" (issues.md
  2026-07-07). Screenshots of a hidden tab still render, which is the trap.
- **Session-limit fan-outs fail silent-ish:** a 4-agent review workflow late in
  a session died on "session limit" for all finders and returned an
  empty-but-completed result after ~510K subagent tokens. Always read the
  failures block and confirm the result is non-empty; fall back to an inline
  single-author review (it found 5 real findings here); don't relaunch before
  the limit resets.
- **Supabase specifics proven live:** supabase-js `upsert` with
  `onConflict: "owner_id,name_key"` works against a unique index on a
  *generated column*; run `get_advisors(security)` after any DDL (it caught an
  RPC-callable SECURITY DEFINER trigger fn and public-bucket listing — fixed in
  `0003_hardening.sql`); GoTrue rejects `@example.com` signups, so test users
  need a plus-tagged real inbox plus a SQL `email_confirmed_at` update.
- **Headless auth for E2E:** sign in with a password test user via supabase-js,
  then inject `sb-<ref>-auth-token` = `"base64-" + base64url(session JSON)` as
  a cookie in the driven browser (single cookie below ~3.2KB, chunked `.0/.1`
  above). Seed/unseed script pattern lives in the session scratchpad (e2e.cjs);
  test account: pranava.raparla+bubble-e2e@gmail.com.
- **Two Anthropic OAuth billing entities, easy to confuse:** `ant auth login`
  / platform.claude.com tokens bill **API credits** (fail "credit balance too
  low" on a credit-less org); `claude setup-token` tokens bill the **Claude
  subscription** (Pro/Max). Both authenticate; both are `sk-ant-oat…`-ish; only
  the billing differs. For "run on my subscription," use `CLAUDE_CODE_OAUTH_TOKEN`
  + the `anthropic-beta: oauth-2025-04-20` header (what Claude Code sends), not
  a platform profile. The subscription inference token is **not** in the macOS
  Keychain `Claude Code-credentials` entry (that holds only per-connector MCP
  OAuth tokens) and **not** in this sandbox's env — it can't be scavenged;
  `setup-token` is the user's step. Don't spoof a "You are Claude Code" system
  prompt to get a subscription token past identity gating — that's circumvention.
- **Subscription tokens are for the developer's own use.** Wiring one into an
  app that serves other users is out of policy; keep it to local/personal dev
  and switch deploys to `ANTHROPIC_API_KEY`.
