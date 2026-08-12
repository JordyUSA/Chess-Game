#!/usr/bin/env node
/**
 * Builds Pocket Chess's bundled puzzle set from the Lichess open database.
 *
 * Source: https://database.lichess.org/lichess_db_puzzle.csv.zst  (CC0)
 *
 * The file is ~304 MB compressed / ~1.1 GB decompressed, so it is streamed and
 * filtered row-by-row. Nothing large is ever written to disk.
 *
 * Two zstd details this depends on, both verified against the real file:
 *   1. The archive opens with a 12-byte *skippable* frame (magic 0x184D2A50,
 *      payload length 4). Node's createZstdDecompress treats that as a complete
 *      frame and emits `end` with ZERO output. The bytes must be dropped first.
 *   2. The real frame needs a raised window limit or it fails to decode.
 *
 * Usage:
 *   node tools/build-puzzles.mjs                 # full run
 *   node tools/build-puzzles.mjs --max-rows=2e5  # quick sample run
 *   node tools/build-puzzles.mjs --source=api    # fallback, no bulk download
 */

import zlib from 'node:zlib';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DB_URL = 'https://database.lichess.org/lichess_db_puzzle.csv.zst';

// ---------------------------------------------------------------------------
// Curation knobs
// ---------------------------------------------------------------------------

/** Max pieces on the board. This is what actually produces the "pocket" feel. */
const MAX_PIECES = 14;
/** Max total plies in the recorded line (opponent move + solution). 8 => mate-in-4. */
const MAX_PLIES = 8;
/** Community validation: only puzzles people liked and actually played. */
const MIN_POPULARITY = 85;
const MIN_PLAYS = 300;

/** Difficulty tiers, by Lichess rating. */
const TIERS = [
  { tier: 1, name: 'Warm-up', min: 0, max: 999, cap: 700 },
  { tier: 2, name: 'Easy', min: 1000, max: 1399, cap: 700 },
  { tier: 3, name: 'Medium', min: 1400, max: 1799, cap: 700 },
  { tier: 4, name: 'Hard', min: 1800, max: 2199, cap: 700 },
  { tier: 5, name: 'Brutal', min: 2200, max: 9999, cap: 500 },
];

/** Motifs offered as drills. Each gets a guaranteed minimum of puzzles. */
const DRILL_THEMES = [
  'fork', 'pin', 'skewer', 'backRankMate', 'deflection', 'discoveredAttack',
  'doubleCheck', 'smotheredMate', 'sacrifice', 'promotion', 'underPromotion',
  'zugzwang', 'xRayAttack', 'interference', 'trappedPiece', 'clearance',
  'attraction', 'hangingPiece', 'capturingDefender', 'quietMove',
  'anastasiaMate', 'arabianMate', 'bodenMate', 'dovetailMate', 'hookMate',
  'doubleBishopMate', 'advancedPawn', 'intermezzo', 'defensiveMove',
  'kingsideAttack', 'queensideAttack', 'exposedKing',
];
const THEME_CAP = 110;

/** Puzzles eligible to be the puzzle of the day: crowd favourites, mid difficulty. */
const DAILY_CAP = 400;
const DAILY_MIN_POPULARITY = 94;
const DAILY_RATING = [900, 2100];

/** Themes that describe puzzle *shape* rather than a motif — not worth surfacing. */
const NOISE_THEMES = new Set([
  'short', 'long', 'veryLong', 'oneMove', 'master', 'masterVsMaster',
  'superGM', 'crushing', 'advantage', 'equality', 'opening', 'middlegame',
  'endgame',
]);

// ---------------------------------------------------------------------------
// Small utilities
// ---------------------------------------------------------------------------

const argv = process.argv.slice(2);
const getArg = (name, fallback = null) => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const MAX_ROWS = Number(getArg('max-rows', '0')) || Infinity;
const SOURCE = getArg('source', 'db');

/** Deterministic PRNG so repeated runs on the same data produce the same set. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(0x50434845); // "PCHE"

/** Count pieces in the board field of a FEN. */
function pieceCount(fen) {
  const board = fen.slice(0, fen.indexOf(' '));
  let n = 0;
  for (let i = 0; i < board.length; i++) {
    const c = board.charCodeAt(i);
    if ((c >= 65 && c <= 90) || (c >= 97 && c <= 122)) n++;
  }
  return n;
}

/**
 * Reservoir sampler: keeps a uniform random sample of `cap` items drawn from a
 * stream of unknown length, so the selection is spread across the whole
 * database rather than biased toward the first rows.
 */
class Reservoir {
  constructor(cap) {
    this.cap = cap;
    this.items = [];
    this.seen = 0;
  }
  offer(item) {
    this.seen++;
    if (this.items.length < this.cap) {
      this.items.push(item);
      return;
    }
    const j = Math.floor(rand() * this.seen);
    if (j < this.cap) this.items[j] = item;
  }
}

// ---------------------------------------------------------------------------
// Streaming source
// ---------------------------------------------------------------------------

/**
 * Decodes exactly one zstd frame from the head of `buf`.
 *
 * The archive is a *sequence* of independent frames (~9 MB compressed / 32 MiB
 * raw each, ~34 of them). Node's decompressor stops cleanly at the first frame
 * boundary and reports how much input it consumed via `bytesWritten`, so frames
 * are chained by restarting a fresh decompressor at that offset. A single
 * decompressor would silently return only the first 32 MiB and emit `end` — the
 * bug this replaces, which quietly truncated the scan to 3% of the database.
 *
 * Returns null when `buf` does not yet hold a complete frame (caller pulls more).
 */
function decodeFrame(buf) {
  return new Promise((resolve) => {
    const d = zlib.createZstdDecompress({
      params: { [zlib.constants.ZSTD_d_windowLogMax]: 31 },
    });
    const parts = [];
    d.on('data', (c) => parts.push(c));
    d.on('error', () => resolve(null)); // truncated frame — need more bytes
    d.on('end', () => resolve({ output: Buffer.concat(parts), consumed: d.bytesWritten }));
    d.end(buf);
  });
}

/** Compressed bytes to accumulate before attempting a frame decode. */
const FRAME_ATTEMPT_BYTES = 14 << 20;

/** Yields CSV lines (header stripped) from the remote multi-frame zstd archive. */
async function* streamDatabaseRows() {
  process.stderr.write(`Fetching ${DB_URL}\n`);
  const res = await fetch(DB_URL);
  if (!res.ok) throw new Error(`Download failed: HTTP ${res.status}`);
  const total = Number(res.headers.get('content-length') || 0);
  process.stderr.write(`  ${(total / 1e6).toFixed(1)} MB compressed\n`);

  const reader = res.body.getReader();
  let pending = Buffer.alloc(0);
  let downloaded = 0;
  let eof = false;
  let carry = '';
  let first = true;
  let frames = 0;
  let lastLog = Date.now();

  // Drop the 12-byte leading skippable frame (magic 0x184D2A50) before the
  // first real frame; a decompressor treats it as a complete empty frame.
  const dropLeadingSkippable = () => {
    if (pending.length < 8) return false;
    const magic = pending.readUInt32LE(0);
    if ((magic & 0xfffffff0) !== 0x184d2a50) return true;
    const len = 8 + pending.readUInt32LE(4);
    if (pending.length < len) return false;
    pending = pending.subarray(len);
    return true;
  };

  let headerDropped = false;

  while (true) {
    if (!eof && pending.length < FRAME_ATTEMPT_BYTES) {
      const { done, value } = await reader.read();
      if (done) {
        eof = true;
      } else {
        downloaded += value.length;
        pending = pending.length
          ? Buffer.concat([pending, Buffer.from(value)])
          : Buffer.from(value);
        if (Date.now() - lastLog > 10000) {
          lastLog = Date.now();
          const pct = total ? ((downloaded / total) * 100).toFixed(1) : '?';
          process.stderr.write(
            `  ${pct}%  ${(downloaded / 1e6).toFixed(0)}/${(total / 1e6).toFixed(0)} MB  ${frames} frames\n`
          );
        }
      }
      continue;
    }

    if (!headerDropped) {
      if (!dropLeadingSkippable()) {
        if (eof) break;
        continue;
      }
      headerDropped = true;
    }

    if (!pending.length) break;

    const frame = await decodeFrame(pending);
    if (!frame) {
      if (eof) break; // trailing bytes that never form a frame
      continue;
    }
    pending = pending.subarray(frame.consumed);
    frames++;

    if (frame.output.length) {
      const text = carry + frame.output.toString('utf8');
      const lines = text.split('\n');
      carry = lines.pop();
      for (const line of lines) {
        if (first) { first = false; continue; } // CSV header
        if (line) yield line;
      }
    }
    if (eof && !pending.length) break;
  }

  if (carry && !first) yield carry;
  process.stderr.write(`  decoded ${frames} zstd frames\n`);
}

/** Fallback source: assemble a small set from the public API. */
async function* streamApiRows(target = 600) {
  process.stderr.write(`Fallback: pulling ~${target} puzzles from the Lichess API\n`);
  const seen = new Set();
  for (let i = 0; i < target * 2 && seen.size < target; i++) {
    const res = await fetch('https://lichess.org/api/puzzle/next');
    if (!res.ok) break;
    const { game, puzzle } = await res.json();
    if (!puzzle || seen.has(puzzle.id)) continue;
    seen.add(puzzle.id);
    // The API gives the game PGN plus a solution that excludes the opponent's
    // first move. Replay to the ply before it so we match the CSV convention.
    const { Chess } = await import('../vendor/chess.js');
    const chess = new Chess();
    const sans = game.pgn.split(' ').filter(Boolean);
    for (const san of sans.slice(0, puzzle.initialPly)) {
      try { chess.move(san); } catch { break; }
    }
    const lastMove = chess.history({ verbose: true }).pop();
    if (!lastMove) continue;
    chess.undo();
    const opponentUci = lastMove.from + lastMove.to + (lastMove.promotion || '');
    const moves = [opponentUci, ...puzzle.solution].join(' ');
    yield [puzzle.id, chess.fen(), moves, puzzle.rating, 0, 100,
           puzzle.plays, (puzzle.themes || []).join(' '), '', '', ''].join(',');
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const tierPools = TIERS.map((t) => ({ ...t, res: new Reservoir(t.cap) }));
  const themePools = new Map(DRILL_THEMES.map((t) => [t, new Reservoir(THEME_CAP)]));
  const dailyPool = new Reservoir(DAILY_CAP);

  let scanned = 0;
  let eligible = 0;

  const rows = SOURCE === 'api' ? streamApiRows() : streamDatabaseRows();

  for await (const line of rows) {
    if (scanned >= MAX_ROWS) break;
    scanned++;

    // Safe to split on ',': FEN, Moves, Themes and OpeningTags are all
    // space-delimited internally, and no field is quoted.
    const f = line.split(',');
    if (f.length < 8) continue;

    const [id, fen, moves, ratingRaw, , popRaw, playsRaw, themesRaw] = f;
    const rating = +ratingRaw;
    const popularity = +popRaw;
    const plays = +playsRaw;
    if (!id || !fen || !moves || !Number.isFinite(rating)) continue;

    if (popularity < MIN_POPULARITY || plays < MIN_PLAYS) continue;
    const ply = moves.split(' ');
    if (ply.length < 2 || ply.length > MAX_PLIES) continue;
    if (pieceCount(fen) > MAX_PIECES) continue;

    eligible++;
    const themes = themesRaw.split(' ').filter(Boolean);
    const record = { id, fen, moves, rating, themes };

    const tier = tierPools.find((t) => rating >= t.min && rating <= t.max);
    if (tier) tier.res.offer(record);

    for (const theme of themes) {
      const pool = themePools.get(theme);
      if (pool) pool.offer(record);
    }

    if (popularity >= DAILY_MIN_POPULARITY &&
        rating >= DAILY_RATING[0] && rating <= DAILY_RATING[1] &&
        themes.some((t) => t.startsWith('mateIn'))) {
      dailyPool.offer(record);
    }
  }

  process.stderr.write(`\nScanned ${scanned.toLocaleString()} rows, ${eligible.toLocaleString()} eligible\n`);

  // Merge tier picks with theme picks, deduping by id. Theme picks are assigned
  // to whichever tier their rating belongs to.
  const byId = new Map();
  for (const t of tierPools) for (const r of t.res.items) byId.set(r.id, r);
  for (const pool of themePools.values()) for (const r of pool.items) byId.set(r.id, r);

  const buckets = new Map(TIERS.map((t) => [t.tier, []]));
  for (const r of byId.values()) {
    const tier = TIERS.find((t) => r.rating >= t.min && r.rating <= t.max);
    if (tier) buckets.get(tier.tier).push(r);
  }

  await fs.mkdir(path.join(ROOT, 'data', 'puzzles'), { recursive: true });

  const themeTotals = {};
  const tierMeta = [];

  for (const t of TIERS) {
    const list = buckets.get(t.tier).sort((a, b) => a.rating - b.rating);
    // Shard-local theme table: themes become integer indices to save bytes.
    const themeIndex = [];
    const themeId = new Map();
    const rows = list.map((r) => {
      const keep = r.themes.filter((x) => !NOISE_THEMES.has(x));
      const idx = keep.map((name) => {
        if (!themeId.has(name)) {
          themeId.set(name, themeIndex.length);
          themeIndex.push(name);
        }
        return themeId.get(name);
      });
      for (const name of keep) themeTotals[name] = (themeTotals[name] || 0) + 1;
      return [r.id, r.fen, r.moves, r.rating, idx];
    });

    const shard = { v: 1, tier: t.tier, name: t.name, themes: themeIndex, p: rows };
    const file = `data/puzzles/tier-${t.tier}.json`;
    await fs.writeFile(path.join(ROOT, file), JSON.stringify(shard));
    const bytes = (await fs.stat(path.join(ROOT, file))).size;
    tierMeta.push({
      tier: t.tier, name: t.name, file,
      count: rows.length, rating: [t.min, t.max], bytes,
    });
    process.stderr.write(`  tier ${t.tier} ${t.name.padEnd(8)} ${String(rows.length).padStart(5)} puzzles  ${(bytes / 1024).toFixed(0)} KB\n`);
  }

  // Daily pool is self-contained so the daily puzzle needs no shard load.
  const daily = dailyPool.items
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((r) => [r.id, r.fen, r.moves, r.rating, r.themes.filter((x) => !NOISE_THEMES.has(x))]);
  await fs.writeFile(path.join(ROOT, 'data/daily.json'), JSON.stringify({ v: 1, p: daily }));
  process.stderr.write(`  daily pool  ${daily.length} puzzles\n`);

  const index = {
    v: 1,
    generated: new Date().toISOString().slice(0, 10),
    source: 'lichess.org open database (CC0)',
    total: tierMeta.reduce((n, t) => n + t.count, 0),
    tiers: tierMeta,
    daily: { file: 'data/daily.json', count: daily.length },
    themes: Object.fromEntries(
      Object.entries(themeTotals)
        .filter(([name, n]) => DRILL_THEMES.includes(name) && n >= 12)
        .sort((a, b) => b[1] - a[1])
    ),
  };
  await fs.writeFile(path.join(ROOT, 'data/index.json'), JSON.stringify(index, null, 2));

  process.stderr.write(`\nTotal: ${index.total} puzzles across ${TIERS.length} tiers, ${Object.keys(index.themes).length} drillable themes\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
