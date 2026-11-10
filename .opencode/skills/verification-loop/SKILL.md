---
name: verification-loop
description: Use when running the project's verification suite (test/typecheck/lint/format/build) or before claiming any work is done — batches all checks into a single command run with tail-filtered output, prevents redundant re-runs of checks whose inputs did not change, and defines the minimal re-check set after a small edit. Replaces the habit of running test, then typecheck, then lint as separate slow turns.
---

# Verification Loop

## Overview

Verification is the most token-expensive routine in this repo: each layer
takes seconds to minutes and prints hundreds of lines. Running layers one per
turn multiplies cost; re-running green layers after an unrelated tiny edit
wastes the rest. The discipline: **one batched run, filtered output, and a
minimal delta re-check set.**

## The batched gate (per session, after finishing edits)

Run the full gate in ONE command, output filtered:

```
bun run format:check 2>&1 | tail -1; echo ===; bun run lint 2>&1 | tail -2; echo ===; bun run typecheck 2>&1 | tail -3; echo ===; bun run test 2>&1 | tail -3
```

- Format lệch → chạy `bun run format` (biến đổi tất-định, tự sửa được) rồi
  re-check duy nhất `format:check`, không chạy lại 3 lớp còn lại.
- Đổi gì trong `convex/` → thêm `bun convex dev --once` vào TRƯỚC typecheck
  trong cùng lệnh.
- Read only the tails. If a layer fails, read the targeted error with search
  or a windowed read — not the whole log again.

## Redundancy rules

1. **A green check is a fact until its inputs change.** After a green full
   gate, an edit confined to `src/**` does not invalidate the Convex/CI layer;
   an edit confined to `docs/**` only needs format+lint.
2. **Minimal re-check sets:**

   | Đổi gì                                | Chạy lại tối thiểu                       |
   | ------------------------------------- | ---------------------------------------- |
   | `*.md` docs only                      | format + lint                            |
   | `src/**` (UI/logic)                   | typecheck + test + build nếu trước build |
   | `convex/**`                           | codegen → typecheck → test               |
   | `bot/**`                              | test bot + typecheck                     |
   | cấu hình (eslint, tsconfig, tailwind) | full gate                                |

3. **Never claim "đã chạy/đã xanh" without output in context** proving it —
   but also never paste the full log into the final report; summarize as
   `X/X suites · tsc OK · lint OK`.
4. **Cache failure knowledge.** When a check fails, record the exact failing
   file:line in the progress note. The retry command then targets that layer
   only: e.g. only `bun run test` after fixing a test, not the whole gate.

## Integration with AGENTS.md Pha 4

This skill implements Pha 4's boundary in the cheapest correct way: the gate
is still ALL of format + lint + typecheck + test (plus build when shipping to
production) — the difference is batching, filtering, and delta re-runs.
