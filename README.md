# Pocket Chess

Small boards, sharp tactics. A minimalist chess puzzle trainer in the spirit of
[Pocket Chess](https://apps.apple.com/us/app/pocket-chess/id1580054076) — sparse
positions, unlimited no-penalty retries, and a hint ladder that never leaves you
stuck.

**Play it: https://jordyusa.github.io/Chess-Game/**

**No ads. No paywalled hints. No tracking. Works offline.**

```bash
npm start          # http://localhost:8000
npm test           # 57 tests, no dependencies
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

Seven piece sets, five board themes, light/dark, and a high-contrast board.

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

**Every bundled asset is permissively licensed.** Seven piece sets ship: six
sourced externally, plus "Pocket", hand-drawn for this project. Note that
Cburnett is taken from **Wikimedia Commons under its BSD 3-clause option** —
the same artwork on Lichess is redistributed under GPLv2+, which this project
could not use. Full attribution is in
[`assets/pieces/CREDITS.md`](assets/pieces/CREDITS.md) and in the app under
Settings → Pieces.

| Set | Author | Licence |
|---|---|---|
| Cburnett | Colin M.L. Burnett | BSD 3-clause |
| Pocket | drawn for this project | MIT |
| Chessnut | Alexis Luengas | Apache 2.0 |
| Vector Ranks | RhosGFX | CC0 1.0 |
| Kiwen Suwi | neverRare | CC BY 4.0 |
| Totoy | Kosal Sen | CC BY 4.0 |
| Papercut | Nikolay Anzarov | CC BY 4.0 |

Pocket stays as the set whose colours come from CSS custom properties, so it is
the one that follows board themes and the high-contrast accessibility theme;
the external sets have their colours baked in.

**Sounds are original too.** Lichess's default effects are AGPLv3 and most
alternative packs are CC-BY-NC-SA, so every sound is synthesised at runtime with
the Web Audio API — no audio files at all.

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

## The piece sprite

`tools/fetch-pieces.mjs` pulls the six external sets from their upstream homes
and normalises them into one committed `assets/pieces.svg` (141 KB raw, 32 KB
gzipped, 72 symbols). Three upstream habits have to be undone, because merging
standalone SVG documents into one sprite makes their internals collide:

1. **Different coordinate spaces** — 45, 72, 260, 800, 5871, and papercut in
   millimetres. Each `<symbol>` keeps its own `viewBox` so `<use>` scales it.
2. **Missing viewBoxes** — kiwen-suwi and cburnett declare only width/height. A
   `<symbol>` without a `viewBox` does not scale at all, so one is synthesised.
3. **Colliding internal names** — rhosgfx ships `<style>.cls-2{…}</style>` where
   `.cls-2` is a different colour in different pieces, and kiwen-suwi gives all
   twelve pieces `<clipPath id="a">`. The generator inlines the CSS away
   entirely and namespaces every id to its own symbol. Without that, eleven
   kiwen-suwi pieces were clipped by the wrong rectangle and vanished.

```bash
node tools/fetch-pieces.mjs   # refetch and regenerate the sprite
```

---

## Testing

```bash
npm test
```

57 tests. The most valuable one replays **every bundled puzzle** through the
real rules engine: each FEN parses, every ply is legal, and every `mateInN` tag
actually ends in checkmate after that many player moves. A bad pipeline run
fails CI instead of shipping thousands of unsolvable puzzles.

The rest cover the session state machine (wrong-move recovery, alternative
mates, the hint ladder), Leitner scheduling, date arithmetic across DST, month
and year boundaries, and the piece sprite — every symbol has a viewBox, no id
appears twice, no reference dangles, and every bundled set is credited with a
licence we can actually ship.

---

## Licence and credits

MIT for this project's code. Puzzles are CC0 from Lichess. Chess rules by
[chess.js](https://github.com/jhlywa/chess.js), BSD-2-Clause, vendored with its
licence in `vendor/`. Piece artwork is credited in
[`assets/pieces/CREDITS.md`](assets/pieces/CREDITS.md) — BSD, Apache 2.0, CC0
and CC BY 4.0. Sound design, the Pocket piece set, and everything else was made
for this project.
