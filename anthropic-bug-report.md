# Cowork mount silently truncates Edit-tool writes at file's previous on-disk size

**Product**: Cowork (desktop) — Claude-backed agent mode
**Environment**: Windows 11, Cowork session bash mount over Windows filesystem (`C:\Users\<user>\Documents\...`)
**Severity**: High — silent data loss with no indication to the agent or user
**First observed**: ~2026-05-10
**Confirmed reproducible**: 2026-05-12
**Last observed**: 2026-05-15 (4 files truncated in a single session — see Incident Log below)
**Frequency in one project**: ~19 incidents across 14 sessions (and counting)

## Summary

The `Edit` tool (and `Write` tool when overwriting a pre-existing file) silently truncates files when the resulting content would exceed the file's previous on-disk byte size. The tool reports success and returns the expected new content, but the on-disk file is capped at its prior size, with the tail dropped — often mid-statement, mid-word, or mid-multibyte UTF-8 sequence (one truncation cut a `═` box-drawing char in half, leaving a partial UTF-8 byte sequence).

The bug appears to live in the Cowork mount layer (a Linux bash mount over the Windows filesystem), not in the Edit tool itself. The tool sends correct bytes; the mount drops the overflow.

## Reproducer

**Setup**: Cowork session with a folder mounted from `C:\Users\<user>\Documents\...`.

**Repro 1 (small)**:
1. Create a 5-line probe file via the Write tool: `probe.js` containing 113 bytes.
2. Use the Edit tool on `probe.js` to insert any new content (e.g. add a 50-byte function).
3. `stat probe.js` → file size is still **exactly 113 bytes**, tail is dropped.

**Repro 2 (large)**:
1. Create a 1500-line file via bash heredoc: `large.js` at ~99,000 bytes.
2. Use the Edit tool to insert 3 lines (~70 bytes) after line 750.
3. `stat large.js` → file size is still **exactly 99,000 bytes**, last line around 1498 truncated mid-word.

**Confirmation that it isn't session-creation-specific**: a file created and grown successfully via an earlier Edit in the same session can still hit the cap on a subsequent Edit. Once any Edit (or heredoc) grows the file, the cap snaps to the new on-disk size, and the next Edit caps at THAT new size. So the cap is dynamic, tied to "current on-disk size at the moment Edit fires."

## Diagnostic info already gathered

- `stat <file>` reports `Blocks: 0` on every file in the mount, suggesting a non-standard FS layer.
- Bash-redirected writes (`cat > file << 'EOF' ... EOF`) bypass the cap and write the full content correctly.
- Python `open(path, 'w').write(...)` inside bash also bypasses the cap.
- The Edit tool's tool-result reports success and the expected new file content — there's no indication to the agent that anything went wrong.
- The Read tool, called after the truncated Edit, reads the truncated content (so it's not a cache masking the truth — the file really is truncated on disk).
- The cap bites Write too when overwriting a pre-existing file. Creating a fresh file via Write writes the full requested content (no prior on-disk size to cap against).

## Open questions worth investigating on Anthropic's side

1. Does the same bug bite files outside `~\Documents\` (e.g. `C:\tmp\...`) or only inside?
2. Is the cap truly "previous on-disk size" or something subtler (previous successful write size, allocated block size, mount-layer write buffer)?
3. Why doesn't the bash heredoc path hit the cap — what's different about that write path vs. the Edit/Write tool path?

## Impact

In one project (~25 sessions over 5 days), this bug fired ~19 times — roughly every other session, sometimes multiple per session. Each incident costs 5–15 minutes to detect and recover via heredoc rewrite. Recovery requires the agent to: (a) suspect truncation, (b) verify with `node --check` or equivalent, (c) re-write via bash heredoc from in-context content. When the agent doesn't notice — or notices late — files end up syntactically broken on disk while bundle/dist directories continue running off cached pre-truncation builds, masking the breakage until the next clean rebuild. We have caught several "pre-truncated from a prior session" files this way.

## Incident Log: 2026-05-15 — Reverse Action feature work

While adding a new wagering type ("Reverse Action") to BetSimV2, the cap fired on **all four** of the project's primary source files in a single session:

| File | Pre-edit size | Cap point | Tail dropped |
|------|--------------:|----------:|-------------:|
| `src/state.js` | 10.2 KB | Mid-UTF-8 box-drawing char in a comment | ~250 bytes (broke `node --check`) |
| `src/bets.js` | 45.0 KB | Mid-function (closeReview call) | ~13 KB (functions: buildTeaserCell + everything after) |
| `src/main.js` | 42.8 KB | Mid-identifier `document.getE` | ~21 KB (renderers + init + window-expose block) |
| `src/mobile/main.js` | 63.7 KB | Mid-expression `parseFloat` | ~8 KB (recalc closure + confirmIfBetMobile + renderReviewTeaser) |

All four files left in a state where `node --check` failed. The project's verify/build pipeline would have failed cleanly on the next run, but the page itself would have served the previously-built `dist/` bundle and looked fine in a browser — so the breakage would have stayed silent through a deploy if not caught.

Recovery required: spawning a sub-agent to reconstruct each file's tail from `verify/bundle.js` (a pre-truncation IIFE-wrapped concatenation that fortunately still existed on disk), un-mangling esbuild's collision suffixes (`_renderBoard2` → `_renderBoard`, etc.), re-adding `export` keywords stripped by bundling, and writing the recovered file back via the Python atomic-write path (which bypasses the cap). One additional Python atomic write was needed afterward to restore two functions (`renderReviewReverse`, `confirmReverseMobile`) that the sub-agent dropped during its head-trim step.

Trigger pattern that session: ~15-20 Edit-tool calls on the three large `src/*.js` files in succession, each one nudging the file size up by a few hundred bytes to a few KB. PROJECT.md explicitly instructs the agent to use `safe-edit.sh` on files >5 KB, but the agent fell back to Edit for individual small changes — and the cap fired on whichever Edit happened to push past whatever buffer threshold the mount uses. The cap is not perfectly correlated with "previous size" — files that had grown several times during the session still got truncated on a later Edit.

**Bonus incident, same session**: while drafting this very bug report and a companion impact summary, the Edit tool calls on `anthropic-bug-report.md` (5139 bytes pre-edit) were silently truncated back to exactly 5139 bytes, dropping every addition. The report was recovered by re-writing the whole file through the Python atomic-write path. The bug is so consistent that it bit the bug report.

## Workaround in place (project-side)

A `scripts/safe-edit.sh` wrapper that takes `(file, old_file, new_file)`, reads the target via Python inside bash, performs the replace, and writes back via heredoc — single syscall, bypasses the cap. Made the documented default in PROJECT.md; the Edit tool is now demoted to <5-line trivial changes only. Plus a `verify/check_integrity.cjs` preflight that walks the canonical file list and flags (a) byte count under a per-file floor, (b) `node --check` syntax failures, (c) last non-whitespace line not ending in a valid closer (catches mid-statement EOF).

## Quantified Impact (token + cost waste)

See companion file `anthropic-bug-impact-summary.md` for the full damages breakdown. Top line for this single project:

- **~131k tokens wasted in the 2026-05-15 session alone** (recovery sub-agent + diagnosis + re-reads + verification + recovering this report itself)
- **~1.5-2.5M tokens wasted across the 19 documented incidents** in this project to date
- **5-15 minutes of recovery time per incident** = ~3-4 hours of agent wall-clock burned on truncation recovery in this project
- **~$10-75 of wasted API spend on this project alone** (Sonnet to Opus range)
- **Silent-deploy risk**: a previously-built `dist/` bundle masked the breakage. Without the project's hand-rolled `verify/check_integrity.cjs` preflight, broken source could have shipped to production while the dev server kept serving the old bundle.

## What would help (in priority order)

1. **Fix the mount-layer write cap** so Edit/Write writes propagate at full size on this mount.
2. **Or**, if the cap is intentional (e.g. resource limit), have the tool surface an error instead of silently truncating — even just a "wrote N bytes, expected M" warning would let the agent retry.
3. **Or**, route the Edit/Write tool's writes through the same path that bash heredoc uses (single syscall, no cap).
4. **Reimbursement consideration** for confirmed product-bug-driven API spend. Standard SaaS practice; the user wants to know whether such credit is available.
