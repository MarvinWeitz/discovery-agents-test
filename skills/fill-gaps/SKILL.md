---
name: fill-gaps
description: Run the optional AI pass of cap-discovery in this Claude Code session - answer the open gaps static analysis left (run/ai/requests), check every answer against the code, and merge the verified findings. Use when asked to fill, answer or settle discovery gaps, or to run the AI pass.
---

# Fill the gaps of a discovery run (AI pass)

The static run is complete without this. This skill spends AI only on the questions static analysis could not settle, one gap at a time, and every claim goes through the evidence gate before it reaches the findings. Nothing here sends the code anywhere but this session's model.

Arguments (all optional, in any order): an out folder (default `.discovery`), `--limit N` (default 10), `--priority high,medium`, `--kind <gap kind>`, `--redo` (also gaps whose answer was rejected or `unknown`).

## 0. Toolkit and run

```sh
T="${CLAUDE_PLUGIN_ROOT}"
[ -d "$T/node_modules/@sap/cds" ] || npm ci --prefix "$T" --ignore-scripts --legacy-peer-deps --no-audit --no-fund
D="node $T/bin/cap-discovery.js"
$D ai status          # what is there; fails when there is no run
```

- No run yet (`no findings in ...`): run `$D run` first (static, about a minute) and say so. Do not change the mode in `discovery.config.json`; the static run stays the default.
- Out folder not `.discovery`: add `--out <folder>` to every `$D` command.

## 1. Plan

```sh
$D ai plan --limit 10 [--priority ...] [--kind ...] [--redo]
```

Prints JSON: `items[]` with `gap`, `priority`, `question`, `request`, `answer` and `prompt`, highest priority first. It writes the request files first when they are missing. Show the person the list (priority and question, one line each) before you start, and how many more are left beyond the limit.

## 2. Answer: one gap-resolver agent per item

For each item, start the plugin's `gap-resolver` agent (subagent type `cap-discovery:gap-resolver`, or `gap-resolver` when the agent is installed in `.claude/agents/`) with the item's `prompt` exactly as given. Up to 4 at a time; they do not depend on each other. Each writes one file, `item.answer`.

Do not answer the gaps yourself in this conversation and do not edit an answer file: the agent reads the code fresh for each gap, and the answer is its work.

## 3. Check each answer, retry once

```sh
$D ai check <gap>
```

- Exit 0: the answer passes as it is.
- Exit 1: the output names each rejected finding, why, and the real lines at the citation. Send that output back to the same agent (or a new `gap-resolver` with the original prompt plus the output) once, asking it to fix the quotes or drop the finding. Then check again. Do not retry a second time; a rejection stays in the log and is visible in the status.
- `no answer at ...`: the agent did not write the file. Retry once.

## 4. Merge and report

```sh
$D ai merge           # gate all answers, rebuild run/findings in mode static+ai, validate
$D ai status
```

Tell the person, in a few lines: how many gaps were answered with accepted findings, how many came back `unknown` (and what would settle them), how many were rejected, and how many are still pending. Point to `run/findings/README.md` (section "AI findings") and `run/ai/merge-log.json`. Say plainly that AI findings are `suspected` and their gaps `answered`, not `resolved`, until a measurement in CI or a person confirms them.

## Rules

- Never touch the app's source, `run/findings/*.jsonl` or `gaps.jsonl` by hand; only the agents write answers, only `ai merge` writes findings.
- An answer can only mark a gap `answered`. Nothing in this pass makes a finding `confirmed` or a gap `resolved`.
- Mode `static` (the default for `cap-discovery run`) ignores the answers but keeps them on disk; `--mode static+ai` or `ai merge` brings them back, re-checked against the current code.
- If the same kind of answer keeps coming up, suggest the `rule-drafter` agent: it turns the pattern into a deterministic rule, so that gap needs no AI next time.
