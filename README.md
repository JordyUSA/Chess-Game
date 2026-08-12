# Pocket Chess

Small boards, sharp tactics. A minimalist chess puzzle trainer in the spirit of
[Pocket Chess](https://apps.apple.com/us/app/pocket-chess/id1580054076) — sparse
positions, unlimited no-penalty retries, and a hint ladder that never leaves you
stuck.

**Play it: https://jordyusa.github.io/Chess-Game/**

**No ads. No paywalled hints. No tracking. Works offline.**

```bash
npm start          # http://localhost:8000
npm test           # 44 tests, no dependencies
```

There is no build step. Open `index.html` on a static server and it runs.

---

## What it does

| Mode | |
|---|---|
| **Daily puzzle** | One puzzle a day, the same for everyone, chosen from the date alone with no server. Streak tracking and a spoiler-free shareable result. |
| **Practice** | 6,465 puzzles across five difficulty tiers. |
| **Motif drills** | Train one tactic at a time — forks, pins, skewers, back-rank mates, smothered mates and 24 more — then read *why* it worked. |
| **Review** | Puzzles you miss come back on a spaced-repetition schedule until they stick. |
| **Play the computer** | Five strengths, from gentle to genuinely annoying. |

### Things it does that the original doesn't

- **Free unlimited hints**, laddered: which piece → which square → play it.
  The original gates hints behind coin purchases, and its reviews are dominated
  by complaints about ad frequency.
- **A "why it works" explainer** after every solve, naming the motif and
  explaining the idea rather than just saying *correct*.
- **Spaced repetition** of your misses — Leitner boxes at 1, 2, 4, 8 and 16 days.
- **Real accessibility**: full keyboard play, an ARIA grid with per-square
  labels, live-region announcements, colour-blind-safe highlight shapes, a
  high-contrast board, and `prefers-reduced-motion` support.
- **Installable PWA** that works with no network at all.

---

## How it is built

Zero-build static site: vanilla ES modules, no bundler, no framework, no
`node_modules` at runtime. The only third-party code is
[chess.js](https://github.com/jhlywa/chess.js) (BSD-2-Clause), vendored as a
single self-contained ESM file in `vendor/`.

```
index.html  sw.js  manifest.webmanifest
css/     tokens (light/dark + 5 board themes), base, board, ui
js/core/ rules, puzzle state machine, srs, daily, dates, store, explain  ← DOM-free, unit tested
js/ui/   board renderer, input (drag/tap/keyboard), sound, fx, screens
js/ai/   alpha-beta search in a Web Worker
data/    5 difficulty shards + a daily pool (~676 KB total)
tools/   build-puzzles.mjs — regenerates data/ from the Lichess database
test/    node:test suites
```

Everything under `js/core/` is DOM-free, so `node --test` imports exactly the
files the browser runs.

### Design decisions worth knowing

**Pieces and sounds are original.** The classic Cburnett piece set is
GPL/CC-BY-SA, about half the Lichess piece sets are CC-BY-NC-SA, and Lichess's
default sound effects are AGPLv3. Rather than inherit those terms, the pieces
are hand-drawn geometric SVG (~4 KB) and every sound is synthesised at runtime
with the Web Audio API — no audio files at all.

**No Stockfish.** Its threaded WASM build needs `SharedArrayBuffer`, which needs
COOP/COEP response headers, which GitHub Pages cannot send; the single-threaded
build is multi-megabyte and would dominate the offline cache of a game whose
premise is being small. `js/ai/worker.js` is ~250 lines of negamax with
alpha-beta, iterative deepening, MVV-LVA and killer-move ordering, and
quiescence search — far stronger than this game needs.

**Focus mode dims, it never crops.** Pocket Chess uses genuinely small boards.
Cropping a real 8×8 position to a sub-board would change its meaning — a rook
two files outside the crop still defends, and a mate can look unreachable. So
the "pocket" feel comes from *curation* (every bundled position has ≤14 pieces)
plus a gentle dimming of squares away from the material.

---

## The puzzle data

Puzzles come from the [Lichess open database](https://database.lichess.org/)
(**CC0**), which carries a difficulty rating and tactic-theme tags for every
puzzle — that is what makes motif drills and the explainer possible.

`tools/build-puzzles.mjs` streams the 304 MB `.zst` archive, filters ~6.1M rows
down to a curated set, and writes compact JSON shards. Nothing large touches
disk; the ~1.1 GB of decompressed CSV is processed in flight.

```bash
npm run build:puzzles         # full run, ~6.1M rows
npm run build:puzzles:quick   # first 200k rows, for a fast iteration
node tools/build-puzzles.mjs --source=api   # fallback via the Lichess API
```

Selection: popularity ≥ 85, ≥ 300 plays, ≤ 14 pieces, ≤ 8 plies, stratified
across five rating tiers with a guaranteed minimum per drillable motif, sampled
with a reservoir so the picks are spread across the whole database.

Two details in that archive cost real debugging time and are worth flagging:

1. **It is a multi-frame zstd archive** (~34 frames of 32 MiB each). Node's
   `createZstdDecompress` stops cleanly at the first frame boundary and emits
   `end` — so a naive reader silently returns 3% of the database with no error.
   Frames are chained using `bytesWritten` to find where each one ended.
2. **It opens with a 12-byte skippable frame.** A decompressor treats that as a
   complete empty frame and yields zero bytes. It has to be dropped first.

The generated data is committed, so the app needs no network and no build.

---

## Testing

```bash
npm test
```

44 tests. The most valuable one replays **every bundled puzzle** through the
real rules engine: each FEN parses, every ply is legal, and every `mateInN` tag
actually ends in checkmate after that many player moves. A bad pipeline run
fails CI instead of shipping thousands of unsolvable puzzles.

The rest cover the session state machine (wrong-move recovery, alternative
mates, the hint ladder), Leitner scheduling, and date arithmetic across DST,
month and year boundaries.

---

## Licence and credits

MIT for this project's code. Puzzles are CC0 from Lichess. Chess rules by
[chess.js](https://github.com/jhlywa/chess.js), BSD-2-Clause, vendored with its
licence in `vendor/`. Piece artwork, sound design, and everything else was made
for this project.
