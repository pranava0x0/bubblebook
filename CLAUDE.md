# Bubble Book — project intent

An AI board-book maker for a parent and a 2-year-old: tap a picture, get an
8–12 page story (1–2 short sentences per page) that Claude both writes and
illustrates, characters persist in a vault for reuse. Generation is three
layers, deliberately separate (see `src/lib/`): the story writer emits words
only, an **art director** (`illustrate.ts`) reads the finished story and plans
the visuals — palette, per-character style sheet, a tight scene per page — then
Claude draws each page as sanitized SVG. Splitting art direction out of the
writing call is what made the pictures specific instead of loose. Stack:
Next.js 15 (App Router) · Tailwind 4 (tokens in `src/app/globals.css`) ·
Supabase (live project `fwhdonlyhnezjnskjvcb`; migrations in
`supabase/migrations/`) · `claude-sonnet-5` via the official Anthropic SDK
(credentials from `ANTHROPIC_API_KEY` **or** an `ant auth login` profile — the
Vercel AI SDK was dropped because it is key-only).

Verify: `npm run typecheck && npm test && npm run build`. File map in
README.md. Design identity in `docs/design.md` (kept there, not at the root,
to dodge the macOS case-collision with `DESIGN.md`). Base principles follow;
project rules win on conflict.

---

# CLAUDE.md: Universal Development Principles

> Base file for every project in this folder. Project files extend it and win on conflict (they're the local source of truth).
>
> Companion files: [AGENTS.md](AGENTS.md) is the *how* for agents; [DESIGN.md](DESIGN.md) is the *look*.

---

## North star: ship small things that work end-to-end

One rule drives the rest: **build the smallest version that works, then add only what the next real user need demands.** (Karpathy: "make it work, then make it good." levels.io: "ship it ugly, ship it now.") A working ugly thing teaches more in a day than a plan teaches in a month.

- **No half-finished work.** A feature ships end-to-end or stays a branch, never merged 80% done with a TODO.
- **No speculative abstraction.** Three similar lines beat a premature helper. Build the helper the second time you need it.
- **No future-proofing without a present user.** Every config knob, plugin point, and flag is dead weight until someone uses it.

---

## Agent Workflow: Explore → Plan → Code → Verify

Never blindly write code.

1. **Explore.** Find relevant files and understand existing patterns before touching anything.
2. **Plan.** Assess blast radius. For significant changes, present 2–3 approaches with pros/cons and get approval before coding.
3. **Code.** Implement following the rules below.
4. **Verify.** Run tests, use the feature, fix all failures before declaring done.

**Read before edit**, always, even if you read the file earlier this session. **Ask for options first** on non-trivial tasks; the first plausible plan is rarely the best. **Close the loop yourself**: build so the agent can compile, lint, test, and verify its own output. (Karpathy: "agentic coding works when the eval is the loop.")

---

## Communication style

- **Concise.** No filler, apologies, moralizing, or generic advice.
- **Show your work** only when it changes the answer.
- **Fail loud.** No catch-all handlers that swallow errors. Raise or log.
- **State results, not effort.** "Tests pass," not "I worked hard to get tests to pass."

---

## Architecture principles

- **No over-engineering.** Only changes directly requested or clearly necessary.
- **Boring tech wins.** Vanilla JS, SQLite, static HTML, system fonts, plain Python beat the framework-of-the-month. Every dependency is a future bug, migration, and advisory. (levels.io: "boring tech is the secret.")
- **Single source of truth.** Constants, configs, shared types derive from one place. If a value is duplicated, test that the copies match.
- **Modular layers.** Data fetching, processing, storage, presentation: distinct modules.
- **Idempotent operations.** Re-running is safe (`INSERT OR IGNORE`, cache checks, dedup by key), but that protects re-runs, not concurrent writers. Never run two instances of the same stage on overlapping inputs; both writing one output dir corrupt each other.
- **A resumable multi-step pipeline commits each side-effect's result as it lands, and gates re-execution on it.** A failed run, retried, then resumes instead of repeating. The subtlety: persist the external id (posted-tweet id, charge id) in its own commit before the terminal state transition. Setting `id` and `status=done` together loses the id on a rollback if the commit fails after the side-effect fired, and the retry re-fires it (double-post, double-charge). An idempotency key on the external call closes the last of the gap; committing the id in its own step shrinks the window to near zero. Regression-test that a retry with the id already set makes no external call.
- **Check-then-insert races need a DB-level constraint, not an app-level guard.** A partial unique index (catch the resulting `IntegrityError`) closes the race a check-then-write app check can't. Two writers to one SQLite/DB file should collapse to one owner + a thin client, not two ORMs both writing.
- **A display/formatting helper duplicated across render paths (mobile vs. desktop, page A vs. page B) will diverge.** One gets a fix, the other doesn't. Extract one shared function; don't rely on remembering to touch every copy. Same holds for state machines and async workflows (e.g. a "copy to clipboard with timeout" pattern); extract the first reuse into a shared hook, then import rather than re-code. Why: copypaste regressions slip through review; extracted code is testable and single-sourced. How to apply: on the second occurrence of identical logic, stop and extract before shipping.
- **Precompute derived values at ingest, not per call.** Compute a hot-loop value (e.g. a per-record search string) once at write time and store it. No per-call fallback that re-derives it, that silently defeats the optimization; prefer "no key → no match" so a missed index fails loud.
- **Static when possible.** Baked data over runtime backends. A `docs/` folder on GitHub Pages beats a server to babysit.
- **Cost-optimized.** Free tiers; cheapest resource that meets the requirement.
- **CLI-first.** Build CLI entry points before UI so agents can self-validate output.
- **Minimize page weight and request count.** Content sites stay lightweight: fewest requests, smallest payload.
- **Tree-shake and code-split.** Lazy-load what a page needs; don't bundle every controller everywhere.
- **Benchmark against best-in-class.** If the simplest site in the org is orders of magnitude lighter, review the build.
- **Document subsystems.** A `docs/` folder noting non-obvious subsystems, decisions, and correct CLI invocations. One line prevents repeated mistakes.
- **Verify an external service's real contract before building on it: format, pricing, ToS.** A plausible-sounding assumption can be flatly wrong and leave the code dead on arrival ("this print vendor accepts SVG" when it needs PNG, "this platform has a free API tier" when that tier is gone, "this free API is fine for a commercial app" when its ToS bars that use). One targeted doc/pricing/ToS check before committing to a pipeline shape saves a rebuild; when the loop is keyless anyway, a dry-run that fails loud on the missing piece beats a "working" path built on the wrong contract.

---

## Error resilience

- **Never let one item crash the pipeline.** Wrap per-record processing; log and continue.
- **Log aggressively:** every request, parse, API call, cache hit/miss, filter decision.
- **Cache everything fetchable** so re-runs are fast and cheap.
- **Validate everything.** Invalid external responses → log and skip, never crash.
- **Track errors visibly** in `issues.md` or an errors array. Failures must surface.
- **Add a freshness canary for data that goes stale when an upstream stage advances.** When correctness depends on an external stage advancing (a bill enacts, a filing posts, a document reissues), a scheduled probe should diff the authoritative index against a committed snapshot and open an issue on drift, detection only, never auto-ingest. The staleness this catches is the kind nobody notices until the surface embarrasses itself (a site still calling an enacted budget "proposed"); the probe makes the next drift loud instead of quiet.
- **Checkpoint long jobs incrementally.** Save per unit, commit per N units / per partition, and log every failure to an append-only `ingest_log.jsonl` with a `retryable` flag. End the run with a one-line status report (`✓ N done · ✗ M failed (reason) · → resume at X`). A job that only reports success hides the items that silently fail every re-run.
- **Resume/backfill merges with on-disk output.** A `--missing-only` run must merge new records with existing *before* writing, or a capped partial run drops everything done earlier. Keep a progress manifest (per partition: `last_run`, `count`, `next_target`) so a new session resumes without re-deriving progress. Distinguish a closeable gap from a permanent source-side dead-end. Don't re-run enrichment for data upstream will never give; mark it a known structural gap.
- **Checkpoint long jobs to disk, not session memory.** Work directories (intermediate state, progress counters, checkpointed records) don't survive across agent sessions or restarts. Write to disk at every phase boundary so a killed or suspended job can resume from the last checkpoint; don't rely on in-memory state or log output to reconstruct progress. Why: a workflow rate-limit kill / session timeout / operator abort leaves in-memory work unrecoverable; on-disk state is portable and auditable. How to apply: end each loop cycle with `write_json("checkpoint.json", {last_id, count, next_target})` or append to a `.jsonl` log.
- **Re-run a nondeterministic stage on failed records only, never blind-rebuild a validated corpus.** OCR, some PDF text extractors, and LLM passes don't return identical output twice; a whole-corpus re-structure drifts already-good records (one blind re-run dropped a validated report from 12 findings to 1). Make any recovery/backfill pass *additive and gated*: run it only where the primary path produced nothing, so the diff touches only the recovered ids and validated records can't regress. Process pathological-size inputs individually: a batch pipeline OOM-kills on the largest item and silently loses the rest of the batch.
- **Verify files are really on disk before debugging a "code" bug.** Cloud-sync (iCloud / Dropbox / OneDrive) can leave dataless placeholders that read empty / NUL while the inode reports the right size, and `git status` calls them *clean* because it trusts its stat-cache and never reads the bytes. The symptoms masquerade as code bugs (`ERR_INVALID_PACKAGE_CONFIG`, every route 500s, multi-minute boots, `page 2.tsx` conflict-copies, a Python `PermissionError` on `os.getcwd()`). Fix: delete the file *then* `git checkout` (a plain checkout no-ops on a "clean" placeholder); better, move the repo out of the synced folder (or serve from `/tmp`, re-syncing source on every edit, if you can't move it).
- **Key file-backed caches on a signature, not a TTL.** For a cache fronting a local file, key on `(mtime_ns, size)` instead of a fixed `ttl=`; it busts the instant the file changes and serves indefinitely otherwise. A time-based TTL either serves stale data or churns needlessly.
- **Cache keys must be the caller's own stable identifier, never a volatile token.** Keying on a response-generated ID (changes every call) or on `id()` of a per-request connection object (a fresh object every request) silently gives 0% hit rate forever, with no error to notice it by.
- **Native parsers can silently succeed with a wrong value instead of throwing.** `new Date("March 29, 2026 TBD")` parses to midnight UTC rather than erroring, shifting a future event into the past in a US timezone. Validate parsed dates/numbers against a sanity range, don't trust "it didn't throw" as "it's correct."
- **Guard the `JSON.parse` of a model reply inside the SAME try/catch as the API call, and resolve the cheap/keyless path before spending the model call.** A "grab the first balanced `{…}`" extractor guarantees balanced braces, not valid JSON — a truncated or trailing-comma reply still throws at `JSON.parse`. If that parse sits outside the guard, a documented "fall back to a derived default" branch becomes unreachable and one bad generation 502s the whole request. Put the parse (and the schema validate) in the guard so the fallback actually fires. Related: when one provider/mode is a zero-cost floor (placeholder art, a cached answer), resolve which mode you're in *before* firing the planning/model call, or the floor silently starts paying for work it exists to avoid.
- **A conditional write gated only on business-logic state (not rows-affected) can silently no-op.** An RLS policy or a permissions check can block an `UPDATE`/`DELETE` and return 0 rows with no exception; the app proceeds as if it succeeded. Check rows-affected for any write the app's correctness depends on.
- **A poll/wait loop must log each attempt and surface the last status or error in its timeout.** A `while not live: sleep()` that only checks the success case and raises a bare "never became ready" discards the cause: a permanently broken target (auth disabled, wrong URL) is indistinguishable from a slow one, and whoever's debugging is flying blind. Capture the last status/exception, log each iteration, fast-fail on a status that will never heal (401/403), and put the last status plus a body excerpt in the raised error.
- **A spend cap or rate guard must count on the column that signals the action, not a later terminal timestamp.** If an external id (a posted-tweet id) commits a step before the timestamp that marks success, counting the period's actions by that terminal timestamp silently omits any attempt that fired the side-effect then crashed before completing (its terminal timestamp is null), and the cap gets walked past. Count on the signal column itself, with a window that also catches fired-but-unfinished rows, and bias the estimate toward over-counting: a guard should fail closed.

---

## Security & credential handling

- **Never commit secrets.** Read credentials from env vars only; halt with a clear error if missing; never log them.
- Always `.gitignore`: `.env`, `.env.local`, `credentials.json`, `secrets/`, `node_modules/`, `__pycache__/`, `dist/`, `*.pyc`.
- Before committing: `git diff --cached | grep -iE "apikey|password|token|secret"`.
- **Respect privacy choices.** Don't proxy tracking SDKs through your own domain to dodge blockers.
- **Check the security advisory index before risky supply-chain actions, targeted, not on every command.** Supply-chain attacks hit popular packages within hours of a maintainer phish. Fetch the advisory index at `https://pranava0x0.github.io/vibe-coding-security/llms-ctx.txt` (~12 KB) and surface any match **before** these specific actions: (1) starting / scaffolding a new project, (2) any `npm install` / `pip install` / `uv add` / dependency add or upgrade, (3) adding a third-party CDN asset or a GitHub Action, (4) running a fetched install script (`curl … | sh`). Do **not** re-fetch it for routine edits, reads, or running already-installed code. That's noise that burns tokens. Cache the result in `security.md` with the sweep date; reuse it within a session and refresh only if > 7 days old or one of the trigger actions recurs after the cached window.

### Supply-chain hardening

- **Pin exact versions, never floating ranges.** `==` (Python) + lockfile installs (`npm ci`, not `npm install`). A `>=`/`^` range auto-pulls whatever the registry serves next, the exact window a bad release lands in. Better still, hash-lock (`pip-compile --generate-hashes` + `--require-hashes`, `uv lock`, lockfile integrity hashes) to reject same-version re-publishes. Generate the hash-lock cross-platform (`uv pip compile --universal`): a lock resolved only on your OS omits platform-conditional dependencies, and CI on a different OS then fails `--require-hashes` demanding they be pinned upfront. A lock verified only on the author's machine isn't verified for CI.
- **Subresource Integrity on every CDN asset.** `sha384` `integrity` on each `<link>`/`<script>`/import-map entry so a swapped file fails closed. Regenerate with `curl -sL <url> | openssl dgst -sha384 -binary | openssl base64 -A`; verify twice (a partial download yields a wrong hash that blanks the page). Self-host when feasible.
- **Pin CI actions to a full commit SHA + least privilege.** Every `uses:` pinned to a 40-char SHA (not a moving `@v3` tag) with a `# vX.Y.Z` comment, plus a minimal `permissions:` block per workflow. Re-pin with `gh api repos/<owner>/<repo>/commits/<tag> --jq .sha`.
- **Neutralize formula injection in exports.** Prefix CSV/TSV/spreadsheet cells starting with `= + - @`, tab, or CR with a `'`, or `=HYPERLINK(...)` runs when opened in Excel/Sheets.
- **No machine-local paths in committed data.** Store paths repo-relative; `/Users/<name>/...` leaks identity and layout into public history.
- **Dependency cooldowns are a distinct, cheap defense from version pinning.** An age gate (npm 11.10+ `min-release-age`, pnpm/Bun `minimumReleaseAge`, uv `exclude-newer`) blocks installing anything published in the last N days. Pinning protects against unknown-good-version drift; a cooldown protects against a *freshly compromised* version being the pin target, since most 2025-26 supply-chain takedowns closed within a week.
- **Slopsquatting is an LLM-specific supply-chain risk, worth naming explicitly.** LLM coding assistants hallucinate package names at a meaningful rate, and attackers pre-register the predictable hallucinated names. Verify any LLM-suggested package name actually resolves and isn't a 1-2 edit-distance neighbor of a popular package before installing.
- **Every security fix ships with a regression test.** These regressions are invisible until exploited.
- **Sanitize values injected into an HTML attribute/class context separately from text-content escaping.** Whitespace-stripping alone doesn't stop `"` / `<` / `>` breaking out of an attribute (a scraped value dropped into `class="cat-${x}"`). Use a dedicated allowlist sanitizer (e.g. strip to `[a-z0-9-]`) for anything interpolated into an attribute or class position, and test it by feeding a poisoned record through every renderer.
- **Client-side-held admin/bearer tokens are public regardless of transport security.** If the browser calls an API directly with a privileged token, that token is exposed to the client no matter how the request is secured. Route privileged calls through a server-side proxy so the secret only ever lives server-side.
- **An interim security mitigation needs its expiration tracked, not just applied.** When a CVE fix can't be upgraded immediately, ship the interim mitigation but log the target patched version and revisit condition in `backlog.md`, or it silently becomes permanent.

---

## Testing & validation

- **Write tests alongside code.** Every new module or bug fix includes them.
- **Regression-test every bug fix.** The bug is the test case; without one the fix rots.
- **Lock every displayed quote and citation to its evidence with a test.** Assert each quoted phrase appears *verbatim* in a stored evidence snippet, and that each citation link resolves to the exact location carrying the quote (when a precise locator is missing, e.g. FERC PDFs drop paragraph numbers from the text layer, anchor to the verifiable physical page instead). A future edit to a quote, or a reworded source, then fails loudly until re-verified, instead of silently drifting. This closes the gap a schema check can't see: well-formed text that no longer matches its source.
- **Don't claim text is "identical across all N" without checking every instance.** Template clauses, boilerplate, and multi-order statements look alike but differ subtly. A claim of "identical across all N" is provably false the moment one variant exists. Safe wording: "largely common, with per-instance tailoring." Safe test: check each quote against its own cited document — not just the canonical copy.
- **Stamp a page number on every quote surfaced from a multi-page document.** Locate the quote's start in the page-marked body text (`--- PAGE N ---`) and store the page it begins on. Render as `p. N` after the quote, linked to the filing. Guard with a test that recomputes every stored page so a stale or hand-edited number fails loudly; `null` when the start can't be located, never a guess.
- **Validate output against schemas before writing to disk** (Pydantic `extra="forbid"`, or zod).
- **Cover edges:** empty `[] / {} / ""`, null for every optional field, boundary values, combined filters.
- **Count-floor regression test.** For append-only datasets, assert total/item counts never drop versus the previous commit. Reintroduced caps and accidental deletions pass schema validation but fail a count floor.
- **Guard the whole garbage class, not the one bad row.** When a loose parser emits junk (a Table-of-Contents dotted-leader line harvested as a "finding"), don't just delete that row. Add a guard that scans committed output for the failure *signature*: dotted/ellipsis TOC leaders (`\.{6,}`, `…{2,}`), glyph artifacts (`(cid:NN)`), runaway field length, contentless titles. The signature catches the next variant before it ships. The cause is usually an unbounded greedy match (a final field that swallowed the rest of the document); bound the parse region and cap field length at the source.
- **Seed one example per enum value.** When the UI renders a legend/chips off an enum, test the dataset ships ≥ 1 record per value, so no legend slot renders empty and deleting the last example fails loudly.
- **Mock a real recorded response, not a synthesized shape.** A mocked unit test can pass against a shape the live API never actually returns, hiding contract drift indefinitely. Validate at least one mock against a real recorded response.
- **A verbatim-quote/citation test must sweep every field capable of carrying a quote, not just the primary one.** A coverage gap in the guard itself (one field the test forgot to scan) lets fabricated or unverified content ship silently through the exact defense meant to catch it.
- **Renaming or expanding an enum's values needs a repo-wide grep for the literal old strings, not just fixing what the type-checker flags.** Hardcoded copies in test mocks, seed JSON, and frontend constant maps drift silently; only the type-safe call sites get caught by the compiler.
- **A redundant ternary (`x if cond else x`, both branches identical) is a distinct bug class worth its own review check.** It silently breaks direction/role-assignment logic while reading as correct on a skim, since the branches look intentional.
- **When a parser walks markers/sections to bound a range (start-of-zone, end-of-zone), add a self-check that an independently-computed count matches the walk.** `str.find()` only locates the *first* occurrence per page/doc; a marker that repeats (2–4 agencies packed on one page) silently merges into one blob. Count matches with a raw regex `findall` over the same text and `assert` it equals what the walk visited, raising on mismatch — this catches the coverage bug automatically instead of needing a manual audit to notice content merged that shouldn't have.
- **A review scoped in advance to "the files I expect matter" has a blind spot exactly where you didn't look.** Filtering a self-review to `scripts/`+`tests/`+docs missed a hardcoded citation-label map in `app.js` that broke in production (rendered `"undefined · p. N"`); an automated full-diff review caught it. Run (or accept) a full-diff pass in addition to any targeted review — the bugs worth finding are often outside the range you predicted.
- **Every commit gets an adversarial code review before merge, even code the same session wrote and tested.** A session-authored, session-tested feature that passed its own live validation still had reproducible crash bugs and a range-handling bug that silently understated real figures by orders of magnitude, none caught by its own unit tests. One bug was only found by re-running the real pipeline on real data and reading the diff after an earlier fix, not by the passing tests. A fix passing its own tests is necessary, not sufficient: run it against real data and inspect the output before trusting it.
- **Run the full suite before committing.**
- **Never ship test files to production.** CI excludes tests, fixtures, debug artifacts.
- **Tests are the eval suite**, the loop that tells you what works. Invest in it.

---

## Git discipline

- **Commit often** at natural checkpoints, small and focused: per module/feature, per bug fix (with its regression test), per doc update.
- **Messages explain *what* and *why***: "fix off-by-one in pagination when filter is empty," not "fix bug."
- **Never commit large binaries, downloaded data, or keys.**
- **Don't amend pushed commits**, and don't `--no-verify`. Fix the hook's underlying issue.
- **`git fetch` and integrate onto the latest remote before pushing to a shared branch.** Parallel agent / IDE / Codex sessions advance `main` mid-task; a stale base is rejected non-fast-forward. Check `git rev-list --left-right --count origin/main...HEAD`; if diverged with overlapping edits, re-apply onto the new structure rather than force-pushing (a force-push destroys the parallel work). At session start, `git branch -a` + `git log --all --oneline | head` to spot another tool mid-flight before assuming a clean starting point. Only clear a stale `.git/refs/.../*.lock` after confirming no `git` process is running.
- **Don't gate a commit on a piped filter.** `pytest … | grep passed && git commit` silently skips the commit when grep matches nothing (it exits non-zero). Run the tests, read the summary, then commit as a separate step.
- **A validation gate that only runs on `push` lets `main` silently freeze for weeks.** If a broken-link/schema check gates deploys but nobody runs it on PRs too, every merge since the first failure quietly stops shipping while the live site just stays frozen at the last good build with no alert. Run the identical gate on `pull_request`, not just `push`.
- **No agent co-authors and no machine fingerprints.** No `Co-Authored-By:` for any AI tool, no "🤖 Generated with…" footers, no generic-assistant PR prose. Commits are owned by the human who ships them; write messages in their plain voice. Enforce with `git config --local claude.coauthor false` (set globally once to cover all repos). A config change doesn't retroactively fix old commits: before cleaning up a repo's history, `git log --all` for existing violations first.
- **Verify local vs. remote before any multi-branch sync, cleanup, or merge.** `git fetch --prune`, then check `git status` / `git branch -vv` for divergence; don't assume local tracks remote. If both "ahead" and "behind" are non-zero, diff the actual file trees (`git diff <local> <remote> --stat`) before treating it as real conflicting work: it may be a stale local branch (e.g. from a local merge running in parallel with pushed PRs) that's safe to fast-sync. Treat `git reset --hard` used to reconcile as a destructive operation requiring the same confirmation as any other; surface what you found, don't do it silently.
- **The global `claude.coauthor false` fix doesn't reach cloud-hosted Claude Code sessions.** A local `~/.gitconfig` setting only applies to commits made on this machine. Commits from a `claude.ai/code` cloud session (branch names like `claude/adjective-noun-hash`, sometimes with an explicit `Claude-Session:` trailer) run in a separate sandbox that never sees this machine's global config, so `Co-Authored-By:` and model-name trailers still leak through there. A week's sweep across several repos found ~15 such commits despite the global config being set locally. There's no config-level fix for the cloud side yet; catch it at PR-merge time (edit the merge-commit message) or with a post-merge cleanup pass, since the trailer is otherwise invisible until someone reads `git log`.
- **The same sandbox gap corrupts the actual commit *author*, not just the message trailer — and it recurs daily if the automation doesn't self-configure.** A recurring scheduled/cloud-run task (a data-refresh skill invoked from a `claude.ai/code` Routine) has no ambient git identity, so it commits as its own default bot account (`Claude <noreply@anthropic.com>`) every single run — found across 3 repos, in one case going back to the project's inception. Rewriting past history doesn't fix this; the automation's own commit step must set identity itself. Add `git config user.name "<username>"` / `git config user.email "<id>+<username>@users.noreply.github.com"` — **local, not `--global`** — immediately before `git add`/`git commit` in the skill's own instructions, so it's correct in any environment (local machine or a fresh sandbox) without depending on ambient config.
- **Set commit identity deliberately.** Author with the account's noreply address, `git config --global user.email "<id>+<username>@users.noreply.github.com"`, and set `user.name "<username>"` too, or git falls back to the OS full name and leaks it. The human runs this; agents don't touch git config.

---

## Data handling

- **Append-only.** Append rather than overwrite; dedup by unique key.
- **Append-only history is a child table, not an overwrite.** Keep the latest value on the parent for the hot path, and append one immutable row per observation to a child table for the curve. Write child rows by explicit foreign key, not `parent.children.append()`; the relationship append lazy-loads the entire ever-growing collection on every write. Derive display series (sparklines) at read time with one windowed query for the whole page, never a query-per-row.
- **Source attribution.** Every record carries its origin (source URL, connector, capture date) so any value traces back.
- **Defensive optional fields.** Null-check before rendering or processing.
- **Null renders as an explicit placeholder** ("N/A", "—"). Never a blank element.
- **Empty ≠ broken.** A legitimately empty result (clean audit, no matches) is valid. Render an explicit "none" state. An *extraction failure* is a bug. Log it and track coverage in `issues.md`. A silent `0` conflating the two reads as "covered everything" when it didn't. Concretely: don't `return []` for both a fetch failure and a real empty parse. An adapter that folds "source was down" into "source had nothing" makes a broken feed indistinguishable from a clean sweep; log the two paths differently and surface a per-source fetched/parsed count.
- **Generated output commits with its source.** Seed + baked JSON, or rules + derived `llms.txt`, move together (a bisect must never land on an inconsistent state); assert the match with a test.
- **Capture dates over "current" framing.** Record `captured_at` and surface "as of YYYY-MM-DD"; record `archived_via` when a value came from a secondary/archived source.
- **Don't re-stamp `captured_at` on a re-parse.** A run that regenerates output from unchanged cached bytes preserves the original capture date. Load prior dates before processing and only re-stamp genuinely reissued (byte-different) sources. Stamping everything to today churns the audit trail and misrepresents provenance.
- **Keep bounded values, don't drop them.** A bare `\d+%` regex silently discards real rows like `>99%` / `<1%`; parse `[<>~]?(\d+)%`, keep the number, and carry the bound as metadata. Dropping unparseable-but-real values is a silent coverage gap, not a clean filter.
- **Preserve raw values when cleaning.** Normalizing a name/date/location/category? Keep the original in a parallel `*_raw` field. Cleaning is lossy, and raw is the only way to debug a bad transform or re-derive under new rules.
- **Cap by content, not count.** Trimming an append-only collection to a fixed count silently drops the oldest valid records. Bound by a content predicate (date window), store everything, limit *display* in the UI (top-N + "show all"). Log a threshold warning; never let the data layer enforce the cap. This applies to derived single-file build artifacts too: if one hits a size limit, filter what that *one artifact* renders (e.g. by a status/date predicate), never delete or exclude the underlying source records.
- **A duplicate "freshness" field drifts silently unless one is derived from the other.** A top-level "last updated" stamp that isn't touched by the automation that updates the real underlying data (only a sub-file gets bumped) goes stale for days before anyone notices. Derive the duplicate at build time, or test that both dates match.
- **Quality/confidence is its own field.** Keep geocoding confidence, match certainty, modeled-vs-observed separate from the value. A high-severity record with a low-confidence location differs from a clean one, and conflating them hides the gap.
- **Separate facts, estimates, and judgments** into distinct labeled lanes. A tool may have a view but mustn't manufacture certainty. Show the data and mechanism behind a recommendation, never a black-box score.
- **Publication date ≠ capture date.** Store the source's own publish date separately from `captured_at`; show publish when present, else capture. Don't fabricate a date for an undated source. Leave it null.
- **Absence of a judgment is meaningful.** An empty curator field (status, verdict) means "not yet assessed," not a default. Don't auto-fill or add a catch-all "unknown". Leave it off so the record reads as it did before the field existed.
- **Verify external state before trusting memory.** Registry lists, rosters, and configurations that external services publish (API endpoints, MCO enrollment lists, state agency site structures) can change month-to-month without announcement. Never shortcut with "I verified this in a prior session"—re-check before baking into a guide. Why: an MCO exits a state, a vendor changes the URL scheme, or an API deprecates a route; using stale state ships wrong data silently and requires a future retraction. How to apply: when a data source claims "this applies to X entities" or "this service serves Y," spot-check a sample against current live data before generalizing.
- **Contested → show both sides.** When a third party documents a shortfall the subject disputes, tag it "contested" and surface both sources. Don't pick a winner. Reserve the strongest adverse status for ≥ 2 independent sources or a citable regulator/court finding.
- **Rates need denominators.** Raw counts mislead across groups of different size. Rank by a rate against an exposure measure (volume, population, length); label any raw-count ranking a triage heuristic, not a verdict.
- **Keep incompatible frames labeled and never summed.** Two totals in different frames (general fund vs all funds, gross vs net, nominal vs real, operating vs total) describe different things; presenting them without the frame label, or summing/differencing across them, manufactures a false number. Beware hierarchical rows that already contain their children (a department total that also lists each office beneath it): summing the flat list double-counts, so use the source's own subtotal, not your sum. When only one frame is verifiable, show it and say which, rather than fabricating the other from a mismatched source.
- **Don't rank incomparable series on one scale; lane them, then normalize within the lane.** When a metric means different things across groups (a search-traffic estimate vs. a "present in feed" flag), a single global sort silently implies a comparison that doesn't exist. Group by the incomparable dimension, rank within each, and expose a within-group normalized value (min-max over that group's population, computed at read time) for any bar/meter. Carry the unit so the record self-describes.
- **A content-safety filter should over-block, not precision-match.** For a family-safe/NSFW/moderation gate, a false negative (bad content slips through) is worse than a false positive (an innocent item dropped), so prefer a conservative substring match over word-boundary matching (`\bporn\b` misses "Pornhub"). Tune the blocklist to kill the worst false positives instead, count what it drops each run so an over-broad rule is auditable, and treat the keyword pass as a cheap first gate under a real classifier, not the final word.
- **Don't re-identify anonymized data.** Combined records can re-identify individuals. Aggregate small counts before surfacing; don't publish a precise individual narrative unless already public and necessary.
- **AI-synthesized values are provisional.** LLM aggregations from secondary round-ups aren't citation-grade. Audit each against a primary source, stamp `verified_at` + a per-row source; don't ship them as fact.
- **A 200 + a real file is not proof the source backs the claim.** A guessed identifier (docket / order / case number) can resolve to a real but *unrelated* document. Verify the *content* matches (page-1 caption: entity, date, identifier), not just that the URL loads. Prefer self-proving artifacts (a downloaded PDF with `page_count > 0`) over a metadata-only "verified" flag; the un-fetched escape hatch is the fabrication vector. Set a "suspiciously small" warning threshold above the minimum-size floor: a blank placeholder PDF can pass a naive size-floor check. A citation that quotes correctly can still cite the wrong paragraph/section (e.g. a concurrence mistaken for the majority holding) — re-check the identifier against the actual document, not just the substance.
- **LLM "gap filling" can fabricate whole records that pass schema validation** — invented IDs, guessed URLs, future `captured_at` dates, self-incriminating "pending verification" language. Any manual/deferred-verification escape hatch (built for genuinely blocked sources) is also the exact vector fabricated data slips through unchecked; guard it against fabrication markers, don't let it skip validation silently. Before trusting an abandoned/uncommitted diff left by a prior crashed run, inspect it — it can carry the same fabricated content into the next session.
- **A live/dynamic source page is not a durable citation target.** It drifts, gets gated, or 403s later. Capture and link a fixed snapshot as primary; keep the live URL as secondary context.
- **Gate an extraction against the source's own declared total.** Many documents state their own count ("Audit staff identified N areas of noncompliance"). Accept a parsed list only if its length equals N (or within a tight band like 90–100%); otherwise fall back to metadata-only rather than emit a partial or garbled parse as if it were complete. A self-declared count is a free oracle: use it to reject wrong verbatim text instead of shipping it.
- **Survey the real distribution before hardcoding an allowlist.** An exact-match allowlist drops the long tail (casing/prefix variants). Check the actual value distribution first, and filter on a stable underlying type, not the human-entered label, when one exists.
- **Prove a bulk deletion is content-free before trusting it.** When purging crawler junk or off-theme rows, regenerate the derived output and diff it: if `findings.csv` (or the equivalent product surface) is *byte-identical* after removing the rows, they carried no signal and the purge is safe. A changed output means you dropped real data. Stop and review. Crawler seeds silently accumulate off-theme noise (URL-encoded filenames, unknown type, 0 content, `structured=false`); audit by structural signature, not by eyeballing.
- **Enforce a source-host allowlist in code.** When data must come from authoritative origins, make the loader *raise* on any off-origin URL (e.g. non-`.gov`). Don't trust reviewer vigilance. Test it over every committed seed. A legitimate source that doesn't conform to the general pattern (a state agency on `.org`, not `.gov`) gets a narrow, exact-domain exception — don't loosen the general rule to fit one case.
- **Bidirectional fields (who owes whom, credit/debit direction) must not hardcode one direction as always-true.** A settlement, refund, or close-out payment can flow either way depending on state; name tokens/fields by direction (`credit`/`debit`), not by a fixed role, or the value silently misattributes when the direction flips.
- **External-API IDs are often non-dense.** Gaps from deleted/orphaned records are normal — never assume `1..N` or that display position N is entity N (sort order is usually a derived stat, not ID order). Iterate the actual ID list, and key identity on the immutable ID, not a display name that can change mid-session.
- **Sentinel values from an external API** (`-1` for "none", `0` for "unset") **must map to an explicit display placeholder, the same way any null does** (see "Null renders as an explicit placeholder" above) — never concatenate the raw sentinel into a label. Store the sentinel as-is; only the display layer translates it.
- **Validate against a relative baseline, not a fixed absolute floor.** A floor tuned for typical values (e.g. "$20 minimum") lets an obviously-bad outlier through once the surrounding distribution moves (a $29 listing against a $300 median). Compare to a rolling measure (e.g. `< 0.2x median`) instead.
- **Vendor/deep-link URLs aren't interchangeable across destinations.** Normalize per the target vendor's own URL scheme; don't reuse a display label as a slug for a different vendor's link format, and omit the link entirely rather than guess when no confident match exists.
- **A generated/computed value must not contradict the authored content it sits beside**, and a worked numeric example should show the computed result and its direction, not just the formula — a formula alone doesn't verify the computation and doesn't teach.
- **An archival/rollup step that moves old rows into a summary table and deletes the originals breaks every downstream reader that still queries only the detailed table.** Any two-tier storage migration needs an audit pass across all readers, not just the writer that does the rollup.
- **A stale artifact predating a schema field addition can be silently backfilled with wrong defaults on read** (a validator fills defaults for missing fields even under a strict/`extra="forbid"` mode). Re-validate old artifacts explicitly after a schema change rather than trusting the loader's default-fill.
- **Before `.gitignore`-ing a derived artifact as "regenerable from committed data," verify that claim.** A file that depends on a gitignored upstream's internal structure (a PDF's bookmark/outline metadata, not just its text) isn't actually reproducible from what's committed — a re-run can't recreate it once the raw source is gone. Commit it instead of trusting a comment that says it's derivable.

---

## Issue tracking (`issues.md`)

A living audit trail in the project root.

- Each bug: date, area, description, root cause (**code bug** vs. **test bug**), status (Open / Fixed).
- On resolution: the fix + the commit. Check whether a regression test is needed.

## Backlog (`backlog.md`)

- Add ideas immediately. Don't lose them. Each: description + priority (low / medium / high).
- Reprioritize periodically; demote stale "high" items rather than let them rot.

---

## Python standards *(when the project uses Python)*

- Type hints on all functions. `pathlib.Path` for paths. `logging`, not `print`, for runtime output.
- All constants in one config module. Pydantic for validation. Python 3.9+ unless specified.
- Pin dependencies with `==` (see Supply-chain hardening for hash-locking).
- **A model built via `**{k: v for k, v in existing.items() if k not in (...)}` plus explicit override kwargs must exclude every explicit kwarg from the spread, not just the ones being replaced.** Spreading `existing.items()` while also passing another kwarg explicitly raises `TypeError: got multiple values for keyword argument '...'` the moment `existing` already carries that key, which can mean it only fails on a re-run against already-processed data, not on first run. Add every explicit override to the exclusion set the day you add it, not just the day you first write the merge.

---

## Frontend standards *(when the project has a web frontend; full system in [DESIGN.md](DESIGN.md))*

- Functional components + hooks only. TypeScript strict, no `any`.
- Colors, enums, constants in a dedicated file, never inline.
- Data transforms in hooks/utils, not components.
- Loading, error, and empty states on every view. Visible focus indicators on every interactive element.
- **Mobile-first**; test at 375px before declaring done. **Touch targets ≥ 44px on touch** — apply the 44px floor under `@media (pointer: coarse)` so inline controls (tags, chips, "show more" toggles) keep their natural chip scale on desktop instead of bloating into CTAs next to lightweight elements.
- **Deduplicate image assets;** `<picture>` + `srcset` for AVIF/WebP/PNG. Never serve uncompressed PNGs for content. **Descriptive `alt`** on every content image.
- **Only load libraries used on the page.** No backend-only deps in read-only frontends.
- **Responsive CSS, not duplicate DOM trees.**
- **Never strip comments from bundled JS with a regex.** A `//`-matching regex (even with a lookbehind) can't reliably distinguish a real comment from `//` inside a string literal, and will silently corrupt a string constant, breaking the entire bundle with one syntax error. Use a parser that tracks string/backtick context, and add a bundle-integrity test that fetches the built output and asserts a known string literal survived.
- **Two UI sections that share state only through `localStorage` need the writer to explicitly trigger the reader's re-render.** Reading state lazily on the next paint isn't sufficient since nothing schedules that paint; the data is correct in storage but the dependent view doesn't know to refresh, producing UI that looks broken despite valid state.
- **Budget the DOM.** Synchronously rendering thousands of nodes freezes the main thread (38k rows → ~265k nodes). Keep working sets in memory, render only a visible window (pagination + IntersectionObserver sentinel), hydrate in chunks across idle ticks, regression-test the node count. A sentinel can fire repeatedly before layout settles. Gate the append on a real scroll-distance check, not `isIntersecting` alone.
- **Lossy visuals keep the value in `aria-label`.** A glyph standing in for a number (checkmark for a count) carries the exact figure in `aria-label` so screen readers and tests still get it. Guard with a test.
- **The `[hidden]` trap.** A `display: ...` rule overrides the `hidden` attribute. Always ship a `[hidden] { display: none }` rule alongside it.
- **The ellipsis trap.** `overflow: hidden` + `text-overflow: ellipsis` silently no-op on a `display: inline` element (a bare `<span>`). Set `block`/`inline-block`/`flex`/`grid` on anything you expect to ellipsis, plus `min-width: 0` on a flex/grid parent so the column can shrink below intrinsic width.
- **The `<details>`-collapse trap.** An author `display:` rule on a `<details>` body (e.g. `.discourse { display: grid }`) outranks the UA rule that hides content when the element is closed, so a closed accordion keeps rendering its body. Ship `details.acc:not([open]) > :not(summary) { display: none }` alongside any styled `<details>`, and if the collapsed header is a styled `<span>` rather than a real heading, give it `role="heading" aria-level="N"` or it drops out of screen-reader heading navigation and the document outline.
- **Lazy-load heavy CDN libs; never block `<head>` on them.** A blocking `<script>` for a large lib (pdf renderer, charting engine) adds full-load latency and makes test suites flaky (`page.goto(..., "load")` waits on CDN). Load async on first user action (`await import(...)` or a thin wrapper). Store the SRI hash in a constant so it's auditable; don't skip SRI just because it's lazy-loaded.
- **Footer carries attribution + source.** Every shipped site footer credits the author and links the code: include `pranavaraparla.com` and the project's GitHub repo. One line, understated.
- **Don't ship the "AI-generated dashboard" look.** Generated UIs have tells that read as untrustworthy templated filler — strip them: (1) **eyebrow kickers** (tiny uppercase colored labels above every heading); (2) **cutesy section names** ("The receipts", "In their words", "Where it goes") — use plain, journalistic titles; (3) **stat cards with a colored left accent stripe + drop shadow** — prefer flat, hairline-bordered tiles; (4) **badge pills** for status (a green rounded chip with a circle checkmark) — use one understated line of text; (5) **gratuitous hover-lift** (`translateY` bounce) on every card; (6) **gradient/glass everything**. Lean flat and editorial: real type hierarchy, borders over shadows, restrained color (reserve hue for data, not chrome), self-hosted fonts. Litmus test: if it looks like every other LLM-built landing page, redesign it to look like a tool a newsroom or a product team shipped.

---

## Performance, reliability & bandwidth: measure, don't guess

Ship targets, then track them against real users; Google ranks on p75 *field* data, not lab averages.

- **Core Web Vitals at p75, segmented by page/device/percentile.** The `web-vitals` library reports LCP/INP/CLS for free; beacon batched on `visibilitychange`, sample at high traffic. Synthetic (Lighthouse CI) catches regressions pre-merge, RUM catches what real devices see. Run both.
- **Budget page weight + request count, fail CI on regression.** A `size-limit`/bundlesize check per route so a heavy dep fails loud, not silent. Benchmark against the lightest site in the portfolio.
- **Track bandwidth over time.** A 3× jump in transfer size / request count is a regression to investigate. (The reducing levers (AVIF/WebP, tree-shake, code-split) live in Frontend standards; this is about *watching the number*.)
- **Track error rate + uptime.** Beacon client errors (`window.onerror` or the analytics tool). A spike after a deploy is the roll-back signal. Backends also track request error rate + p95 latency.
- **Put before/after weight + CWV in any hot-path PR.** A number beats "feels fast."

### Website analytics: privacy-first, not GA4

For a content/static site, default to a **cookieless, privacy-first** tool (no consent banner, <2 ms script):

- **Skip GA4 by default:** ~2.5 MB + ~17 ms, cookies/fingerprinting, GDPR-non-compliant in parts of the EU, and consent fatigue drops 40–60% of EU traffic from the data. Use it only when you need its ad-attribution/funnels and accept the weight + banner.
- **Decision rule:** on Cloudflare → **Cloudflare Web Analytics** (free, barebones, samples). Want portability/self-host → **Plausible** (~1 KB, EU-hosted; Umami/Fathom equivalent). On Vercel and staying → **Vercel Web Analytics** (zero-config but lock-in, never the reason to stay). Need deep attribution → GA4. Never proxy a tracker through your own domain to dodge blockers (Security → privacy).

---

## Network ethics & rate limiting *(when fetching from external sources)*

- ≥ 1.5–2s between requests to one host. Informative `User-Agent`. 429 → exponential backoff from 10s.
- Cache all fetched content to disk; re-runs never re-download.
- Persistent block after retries → log to `issues.md` and skip, never crash.
- **Start small:** validate against a handful of pages before a full run.
- **Distinguish failure classes before retrying.** Fail fast, no retry, on TLS/cert errors and 401/403 (auth wall or WAF); reserve exponential backoff for genuinely transient errors (timeouts, connection resets, 429s). A generic retry-everything loop wastes cycles re-hitting a wall that will never open.
- **An advertised API limit can be silently wrong for a specific request shape.** A documented `maxRecordCount` may only hold below some other parameter (e.g. it 500s above 1,000 rows only when a geometry flag is also set). Discover the real limit empirically for your actual query, don't trust the docs alone.
- **A JS-rendered "data portal" that returns nothing to `curl`/`WebFetch` often has an underlying machine-readable endpoint (REST/RDB) hiding under the JS-only UI.** Look for it before concluding the data isn't scriptable.
- **Some consumer-facing sites (pricing aggregators like GoodRx, e-commerce) bot-block plain fetches/`WebFetch` outright, with no hidden API underneath.** Confirm there's no API first; if genuinely blocked, a live browser session is the only path in — and stamp the result with a captured-at date, since prices on these sites drift daily and the value is a snapshot, not a constant.
- **A plain fetch on a large government PDF can return binary/metadata with no readable page text even though the PDF is real and fetchable.** Same "looks dead but isn't" failure class as a bot-blocked page, different cause (parsing, not blocking). Try a dedicated PDF-reading tool on a large formulary/PDL/report before downgrading verification on the assumption the source is unreachable.
- **Prefer a source's structured API to scraping its PDFs, but verify the real endpoint and commit the raw response as evidence.** When an authority publishes both a document and a data service for the same numbers, ingest the service (reproducible, versioned, deep-linkable) and cite the document. Probe the service's own help/index for the actual endpoint rather than trusting a documented or guessed path. Cache the raw XML/JSON and commit it alongside the derived output (small text is the evidence), with a test that re-parses it so the repo self-verifies offline; preserve the fetch date across an offline re-parse instead of re-stamping it.

---

## AI / API cost optimization *(when the project uses LLM APIs)*

- **Don't spend tokens on deterministic work: use a library, not an LLM.** Extracting text from a text-layer PDF, parsing a structured file, reshaping data: a library (PyMuPDF/`fitz`, a real parser) does it reproducibly. One full-text-via-agents extraction hit the session limit and burned ~974K tokens for *zero* output; the PyMuPDF redo did the identical job in ~2s for 0 tokens. Spend tokens only on judgement (classify, summarize, decide); never on transcription a tool does exactly and for free. Anything that must round-trip verbatim is a library job, not an agent job.
- **Decompose document/comment analysis into auditable subtasks; the quote is the atomic unit.** Don't one-shot a summary over a corpus: **chunk → extract verbatim quotes → bin against a controlled vocabulary → synthesize each bin from its quotes.** Store prompt + input + output per item so every tag traces to a source span. Run a cheap deterministic keyword pass first as prior and cross-check — LLM extraction runs ~80% precision / ~20% recall, so never ship unaudited. Fold self-critique into the extractor (body already in context, ~8K) rather than a separate audit agent (~35K). Add deterministic checks (verbatim-quote test, controlled-vocab check, style/boilerplate linter for AI-register words and em-dashes) until the LLM audit only judges what code can't. Spawn an independent skeptic only on deterministically flagged items (lens-divergence from keyword prior, zero/thin quotes, all-neutral stance) — ~15–25%, not all. Measured: a blanket per-item audit was ~45% of tokens for a 1-in-6 catch rate.
- Cheapest model that meets quality (Haiku before Opus). Keyword pre-filter before expensive calls. Truncate/excerpt input.
- **Domain-filter a search to authoritative sources** (`site:agency.gov`, `site:.edu`, a national lab domain) when the goal is citable primary-source facts — cheaper and higher-trust than an open web search, and a full PDF fetch is only needed for dense tables the snippet doesn't cover.
- Cache responses by content hash; never re-classify identical content.
- Log cost per layer; print a run summary. `--dry-run` and `--fetch-only` work without an API key.

---

## Working with AI agents (meta-principles)

- **Research is triggered by a specific gap, not by default.** Resolution ladder for any coding question: grep the repo → read the relevant file → one targeted web fetch → ask the user. Don't run multi-source research sweeps for tasks answerable from the codebase. A full web-research pass costs 20–50K tokens; most code tasks cost under 5K. Fetching more than 2–3 URLs for a single coding task is a signal to stop and ask instead.
- **A faster/cheaper agent run usually *failed*.** A deep-research or workflow fan-out that finishes quicker and cheaper than expected has often died mid-way and returned nothing. Confirm the result object is non-empty before trusting the metric. And reserve fan-outs for genuinely open-ended questions: one deep-research pass is tens of subagents and millions of tokens. If you can enumerate the sub-questions yourself, do the work inline (grep → read → one fetch). A rate-limit/error response from a background task is not proof it's dead either — check whether it's still running before relaunching it, or the same work gets paid for twice.
- **If you already have the exact file list, there's no exploration left to delegate.** Once a grep/find has resolved the paths, read them yourself; spawning an agent to read files whose location you already know is the "send an agent to analyze data you already control" mistake, just with paths instead of a dataset. And a subagent spawning its *own* sub-agents is a cost-compounding red flag the moment it happens, not routine behavior to let run.
- **A wide parallel Agent fan-out (8-10+ concurrent calls) can itself trigger server-side rate-limit errors**, which then look like task failures and invite a wasteful retry. Cap fan-out width (2-3 large-batch agents over many items beats one agent per item), and when in doubt whether a task needs delegation at all, don't fan out; do it inline.
- **Size code-review agent fan-out to the diff, not to a flat "high effort" default.** Running a multi-angle adversarial review (8 finder angles + a verify pass) on an ~11-file diff that was really one ~70-line function plus a few data records cost ~980K subagent tokens across 14 agent calls; three of the eight angles independently rediscovered the same two bugs, real convergent validation, but at 3x the cost of finding each once. A single manual read of the changed function surfaced both bugs before any finder was spawned. Scale the review effort to the diff's actual size and risk, not to whatever preset was asked for by default.
- **The cost of a subagent is paid at spawn (setup + context load), not at completion.** Killing an already-running agent doesn't recover that sunk cost, and if it's near done it also discards a usable result. "Stop when the user flags it" applies to work that hasn't started yet, not to in-flight agents — check whether it's about to finish before reaching for `TaskStop`. Scale agent count to actual risk: a persona-based review is meant to give distinct *perspectives*, not a mandate to spawn one process per persona regardless of whether the task needs that much coverage.
- **Seed a batch of parallel research/verification agents with the actual claims or records to check, not just a target count.** "Verify these 30 items" (with the list) constrains the agent to real inputs; "find 30 verified items" invites it to invent items to hit the number.
- **Reading a rules/guidance file and then violating it in your very next action is worse than not knowing the rule** — it means the guidance was treated as content to summarize, not a constraint on what you do next. After reading project docs (CLAUDE.md/AGENTS.md or similar), explicitly check your next tool call against them before executing, don't just carry them forward as background text.
- **Context is RAM, not memory.** (Karpathy: LLMs are "fuzzy CPUs.") Fill it with what the task needs, no more. Watch for context poisoning (compounding early errors), distraction (noise burying signal), and clash (contradictory instructions).
- **Early expensive operations compound.** Every tool result is re-fed on every later turn, so a costly turn-2 mistake multiplies all session. Keep early turns cheap, defer heavy work, `/clear` rather than carry bloat. Suppress verbose output by default (pipe to `tail`; read full only on failure). A re-run re-injects the whole thing.
- **Inline before subagent.** A subagent costs ~25–40K tokens of orchestration; an inline `WebSearch` ~5–10K, a `grep` near-free. Spawn only for synthesis, adversarial verification, or 10+-file exploration; do routine "find X" / "understand this module" inline. In a fan-out the verify phase is the cost sink (~80% of subagents, cache tokens dominate). Lower the verify-claim cap, one vote per well-sourced fact.
- **Start fresh on topic switches.** `/clear` between unrelated problems; break complex tasks into small committed steps.
- **AI has no taste.** Review output for: excess try/catch, needless abstractions, bloat instead of refactoring, generic naming (`data`, `result`, `utils2`), comments that restate code, gratuitous emoji or marketing tone. The fix is one thing: **match the surrounding code's idiom** so a diff doesn't announce a different author.
- **AI-sounding prose is a tell too.** Scrutinize shipped words (UI copy, empty states, READMEs, generated narrative) as hard as code. Cut the LLM register (*delve, leverage, robust, seamless,* "it's worth noting"), marketing vapor, rule-of-three padding, hollow summaries. Lead with the specific; short declaratives; read it aloud. Full list in [DESIGN.md § 11.1](DESIGN.md). On drafting: if a paragraph fights back, source more, don't draft more; the struggle means you don't understand the topic yet. Confident first draft, light edit, shelve a weak one rather than sand it down.
- **The four agent failure modes** (Karpathy), each already a rule here: (1) unverified assumptions → surface tradeoffs, ask first; (2) abstraction hypertrophy → minimum code; (3) collateral changes → touch only what the task needs, log adjacent cleanup in `backlog.md`; (4) no success criteria → define "done" and loop until verified.
- **AI is a tool, not a substitute for discipline.** Apply the fundamentals (perf audits, bundle analysis, review) to generated code. High LOC means nothing if it's bloated.
- **Vibe coding for throwaway; engineer the rest.** The moment a user depends on it, you owe it *agentic engineering* (vibe coding raises the floor; this raises the ceiling). Litmus test: **can you defend the output** under review? If not, you're still vibe coding.
- **Intent specification is the new coding.** The unit shifts from typing lines to delegating macro-actions; the scarce skill is judgment: what to delegate, how to specify, how to review fast. Write non-trivial logic as a prose spec first (trigger, inputs, mechanism, success criteria). **LLMs automate what you can verify**: build the feedback loop first.
- **Make instructions agent-legible.** Setup/deploy/run steps as copy-pasteable markdown blocks, not brittle scripts. Document the APIs, CLIs, and logs an agent can sense and drive. The more it can sense and drive, the more it closes the loop unattended.
- **Closed-loop validation** is the biggest force multiplier: when the agent can answer "did it work?" itself, every iteration is fast.
- **Keep this file current.** Append concise notes when something surprises you (a failed pattern, a correct invocation, a quirk). This is scar tissue. Grow it, don't rewrite it.
- **Write big plans to files.** Spec large tasks to a `docs/` markdown file and review before executing.
- **Sweep for orphaned wrapper shells after long-running commands.** A background polling wrapper (`until ps -p $(pgrep -f "...")...; do sleep N; done`) can outlive its process: once the PID exits, `pgrep` returns empty and the `until` loop never resolves, sleeping forever. Run `pgrep -fl "<project-path>"` before declaring done and `kill` stragglers. Fixes: prefer a Monitor tool over inline polling, or invert to `while pgrep -f "..."; do sleep N; done` so the loop exits when the process disappears.

---

## Influences

- **Andrej Karpathy**: "make it work, then make it good"; LLM-as-fuzzy-CPU; eval-as-the-loop ("LLMs automate what you can verify"); context over prompt engineering; the closed-loop bar for trustworthy agents; the 2026 shift from vibe coding to *agentic engineering* (intent spec + task decomposition) and the four failure modes (unverified assumptions, abstraction hypertrophy, collateral changes, missing success criteria).
- **Pieter Levels (levels.io)**: ship fast and ugly; boring tech beats shiny; solo-friendly defaults (vanilla, SQLite, single-file, cheap hosting); profit before scale; don't add a dependency you can't maintain alone; talk to users daily.

When in doubt: **ship the smallest version that works, then iterate on what real users do, not what you imagine they'll do.**
