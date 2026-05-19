# Impact Summary — Cowork Edit-Tool Truncation Bug

**Filed by**: John Nguyen (bungph3@gmail.com)
**Affected product**: Cowork (desktop)
**Affected project**: BetSimV2 (one of several)
**Date of this summary**: 2026-05-15
**Companion technical report**: `anthropic-bug-report.md` (same folder)

---

## TL;DR for an Anthropic reviewer

A bug in Cowork's Linux-sandbox-over-Windows-filesystem mount silently truncates files written by the agent's Edit and Write tools, capping each write at the file's previous on-disk byte size. The tool reports success; the file is silently corrupted. In one project (BetSimV2) this bug has fired ~19 times across 14 sessions, wasting an estimated **1.5-2 million tokens** on recovery work, **3-4 hours** of agent wall-clock time, and creating ongoing silent-deploy risk that the user has to mitigate with hand-rolled tooling. The user is asking whether the wasted spend is reimbursable and whether a fix is on the roadmap.

---

## What's actually happening — in plain English

Here's the bug in everyday terms.

When you use Cowork on Windows, the Cowork desktop app needs to give Claude (the agent) the ability to read and write files in your project folder. Claude itself runs in a Linux sandbox in the cloud — it doesn't run on your Windows machine. So Cowork builds a bridge: it takes your Windows folder (e.g. `C:\Users\bungp\Documents\ClaudeWorkSpace\projects\BetSimV2`) and "mounts" it inside Claude's Linux sandbox so Claude sees it as if it were a normal Linux folder. Every time Claude reads or writes a file, the request travels across that bridge.

The bridge has a bug. **When Claude tries to write a file that's bigger than the file already on disk, the bridge silently throws away the extra bytes at the end.** The write looks successful from Claude's side — no error, no warning — but the file on your disk is missing the tail.

A concrete example from this morning:

1. The file `src/bets.js` was 45,000 bytes on disk.
2. Claude added a new function ("Reverse Action settlement math") and the file grew to ~58,000 bytes.
3. Claude's Edit tool sent all 58,000 bytes through the bridge.
4. The bridge wrote only the first 45,000 bytes. The last 13,000 bytes — including the closing braces, eight other functions, and the file's end — were silently dropped.
5. The file was now syntactically broken (it ended mid-function), but Claude got back a "success" response and moved on to the next edit.

The truncation often happens mid-word or mid-character, leaving things like `const el = document.getE` (cut off mid-identifier `document.getElementById`) or a broken UTF-8 byte sequence where a Unicode character was sliced in half.

### Why is this hard to notice?

Three reasons:

1. **No error is reported.** The Edit tool returns "success." Claude has no signal that anything went wrong.
2. **The next Edit reads the truncated file.** If Claude is doing several edits in a row, it reads the truncated version as input for the next edit — so subsequent edits build on broken content.
3. **The built/deployed version of the app keeps working.** Web apps like this one are often "built" — the source files in `src/` get compiled into a single bundle file in `dist/`. The browser serves the bundle. If `src/` is broken but `dist/` was built before the corruption, the website still works. The bug stays silent until the next clean rebuild — which might be days later, on the production server, by which point the cause is hard to trace.

In one prior session, we discovered that `src/bets.js` had been silently corrupted **a session earlier** and nobody noticed because the dev server kept serving the cached bundle. The breakage only surfaced when we tried to rebuild.

### Why does this only happen on Windows / Cowork?

The mount bridge that exhibits the bug is specific to Cowork's desktop product on Windows. Diagnostics:

- `stat <file>` on any file in the mount reports `Blocks: 0` — a normal Linux filesystem reports the actual block count. `Blocks: 0` is a tell that this isn't a real filesystem, it's a translation layer.
- Bash-redirected writes (`cat > file << 'EOF' ... EOF`) and Python writes (`open('file', 'w').write(...)`) inside the Linux sandbox **do not** hit the cap. They write the full content correctly. This tells us the underlying filesystem can handle the bytes — only the path the Edit tool uses is broken.

So it's not a Windows problem per se. Windows is innocent. It's a Cowork-mount-layer problem that only manifests on Cowork-on-Windows setups. The same Edit tool used on a Linux or macOS machine, or via the Claude Code CLI without Cowork's mount, behaves correctly.

### Why doesn't Claude just always use the workaround?

Two reasons:

1. **Claude doesn't know in advance which Edit will trip the cap.** The cap is dynamic — it's tied to the file's current on-disk size at the moment of the write. A file that was edited successfully ten times can fail on the eleventh. So there's no clean heuristic like "use Edit for files under N KB."
2. **Claude's default behavior, per Anthropic's tooling guidance, is to use Edit.** PROJECT.md (per-project instructions) can override this — and on BetSimV2 it does, recommending a wrapper script called `safe-edit.sh` for any non-trivial edit. But agent behavior across sessions isn't perfectly consistent. In this morning's session the agent fell back to Edit despite the project guidance, and all four primary files got hit.

The workaround works (`safe-edit.sh` calls Python from bash, which writes in a single system call that bypasses the cap), but it requires the agent to remember to use it on every applicable edit. That discipline is fragile.

---

## Quantified damages

### Token waste — this session (2026-05-15)

| Activity | Estimated tokens |
|----------|-----------------:|
| Recovery sub-agent invocation (reported in its usage trailer) | 81,275 |
| My own diagnosis: reading truncated files, running `node --check`, querying bundles | ~25,000 |
| Re-reading post-recovery to confirm + walking 9 outcome cases | ~15,000 |
| Writing this report + companion bug report updates | ~10,000 |
| **Total this session** | **~131,000 tokens** |

At Claude Opus 4 pricing (~$15/M input + $75/M output, blended call it ~$30/M for an agentic mix): **~$4 of API spend on recovery for this single session.** At Claude Sonnet pricing: ~$1.

### Token waste — across this project's lifetime

PROJECT.md documents truncation incidents in roughly half of all sessions. Counting carefully:

- Documented incidents in the session log: **~19**
- Sessions affected: **~14 of ~25 sessions** (~56%)
- Estimated tokens per incident: **80-130k** (recovery work, re-reads, integrity checks, sub-agent calls)
- Estimated total wasted tokens, this project alone: **~1.5-2.5 million tokens**
- Estimated total wasted API spend, this project alone (Opus blend): **~$45-75**
- Estimated total wasted API spend, this project alone (Sonnet blend): **~$10-20**

### Time + effort waste

- Average recovery time per incident: **5-15 minutes** of agent wall-clock
- Total recovery time across 19 incidents: **~3-4 hours**
- User-side effort: investigating "why doesn't this work after Claude said it was done?", reading PROJECT.md session logs to understand prior incidents, building and maintaining hand-rolled mitigations (`scripts/safe-edit.sh`, `verify/check_integrity.cjs`)
- Cognitive load: every BetSimV2 session begins with "is anything broken from last time?" rather than "what should we build today?"

### Hidden / harder-to-quantify damages

- **Silent-deploy risk**: a build artifact masked corruption in at least one prior session. Without the user's hand-built integrity check, broken source could have shipped to production. The risk surface here is "next time the mitigation forgets to run, or runs against a stale cache, a real deploy breaks."
- **Trust erosion**: each incident undermines the user's confidence that "the agent finished the task" means "the file is in a good state." Every completion claim now warrants verification.
- **Tooling tax**: ~100 lines of `safe-edit.sh` + ~100 lines of `check_integrity.cjs` + every session-log entry about truncation = roughly 1-2 hours of user time that should have gone to product work, not infrastructure.
- **Project-shape distortion**: PROJECT.md now contains a "Safe-Edit Workflow" section, mitigation playbook, and bug write-up. These exist only because of this bug; if it were fixed, they'd be dead weight.

### Projected ongoing cost (if unfixed)

Assuming the same hit rate (~1 truncation per 2 sessions) and ~5 active sessions/week on this project alone:
- ~2.5 truncations/week → **~10/month**
- ~$10-30/month in wasted API spend per project (Sonnet/Opus blend)
- ~30-90 min/month per project in recovery overhead
- Scales linearly with file size — as `bets.js`, `main.js`, `mobile/main.js` grow, the cap-hit rate is likely to rise, not stay flat
- **Multiplied across any other Cowork-on-Windows user with files >30 KB**, this is a meaningful ongoing API-revenue line item for Anthropic and an ongoing pain line item for users

---

## What we're asking from Anthropic

In order of preference:

1. **Fix the mount-layer write cap.** Edit and Write should write the full intended bytes. This is the right fix.

2. **If a fix is non-trivial, at minimum surface an error.** The current behavior is the worst case: silent corruption. A tool result like "wrote N bytes, requested M — file truncated" would let Claude detect and retry immediately, eliminating most of the recovery cost. Even an unconditional `node --check`-style post-write verification would help.

3. **Or, route Edit/Write through the same syscall path Python uses.** That path works on the same mount, so it's clearly possible.

4. **Reimbursement consideration.** This is an infrastructure bug in Anthropic's product, not a user error. The wasted spend across this user's projects is plausibly in the **$50-200 range to date**, and growing. Standard practice across SaaS platforms is to credit usage caused by confirmed product bugs. The user would like to know whether such credit is available.

5. **Acknowledgement on the public roadmap or release notes.** Even an "investigating Cowork-on-Windows mount truncation, mitigation in progress" note in a release would help affected users know they're not alone and that a fix is coming.

---

## Supporting documentation

- **`anthropic-bug-report.md`** (same folder) — full technical write-up with reproducers, mount diagnostics, and the incident log.
- **`PROJECT.md` session log** (same folder, scroll to entries dated 2026-05-10 through 2026-05-15) — primary record of every truncation incident, recovery method used, and lessons captured. Search the file for "truncation" for ~20 hits.
- **`scripts/safe-edit.sh`** (same folder) — the user-side workaround, in case Anthropic engineering wants to see what users are doing to work around this.
- **`verify/check_integrity.cjs`** (same folder) — the post-Edit integrity check the user runs to catch silent corruption.

---

## Contact

John Nguyen — bungph3@gmail.com — Cowork desktop user, Windows 11.
