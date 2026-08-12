/**
 * Puzzle data access.
 *
 * The bundled set is ~6,500 puzzles split into five difficulty shards plus a
 * self-contained daily pool. Shards are fetched on demand and cached for the
 * session; the service worker precaches them so everything works offline.
 *
 * Row format (compact on purpose — short keys and integer theme ids keep the
 * whole set under 700 KB):
 *   [id, fen, moves, rating, themeIndices]
 */

import { puzzleFromRow } from './core/puzzle.js';

const BASE = new URL('.', import.meta.url).href.replace(/js\/$/, '');

let indexPromise = null;
const shardCache = new Map();
let dailyPromise = null;
let allPromise = null;

async function getJson(path) {
  const res = await fetch(BASE + path, { cache: 'default' });
  if (!res.ok) throw new Error(`Failed to load ${path} (${res.status})`);
  return res.json();
}

export function loadIndex() {
  if (!indexPromise) {
    indexPromise = getJson('data/index.json').catch((err) => {
      indexPromise = null;
      throw err;
    });
  }
  return indexPromise;
}

/** All puzzles in one difficulty tier (1-5). */
export function loadTier(tier) {
  if (!shardCache.has(tier)) {
    const p = getJson(`data/puzzles/tier-${tier}.json`)
      .then((shard) => shard.p.map((row) => puzzleFromRow(row, shard.themes)))
      .catch((err) => {
        shardCache.delete(tier);
        throw err;
      });
    shardCache.set(tier, p);
  }
  return shardCache.get(tier);
}

/** Every bundled puzzle. Used by theme drills and review lookups. */
export function loadAll() {
  if (!allPromise) {
    allPromise = loadIndex()
      .then((index) => Promise.all(index.tiers.map((t) => loadTier(t.tier))))
      .then((lists) => lists.flat())
      .catch((err) => {
        allPromise = null;
        throw err;
      });
  }
  return allPromise;
}

export function loadDaily() {
  if (!dailyPromise) {
    dailyPromise = getJson('data/daily.json')
      .then((d) => d.p.map((row) => ({
        id: row[0],
        fen: row[1],
        moves: row[2].split(' '),
        rating: row[3],
        themes: row[4] || [],
      })))
      .catch((err) => {
        dailyPromise = null;
        throw err;
      });
  }
  return dailyPromise;
}

export async function puzzlesWithTheme(theme) {
  const all = await loadAll();
  return all.filter((p) => p.themes.includes(theme));
}

export async function puzzlesByIds(ids) {
  const wanted = new Set(ids);
  const found = new Map();
  for (const p of await loadAll()) if (wanted.has(p.id)) found.set(p.id, p);
  for (const p of await loadDaily()) if (wanted.has(p.id) && !found.has(p.id)) found.set(p.id, p);
  // Preserve the caller's ordering (most overdue first, for review).
  return ids.map((id) => found.get(id)).filter(Boolean);
}

/**
 * A shuffled, non-repeating queue over a puzzle list.
 * Wraps around with a fresh shuffle once exhausted.
 */
export function makeQueue(puzzles, seed = Date.now()) {
  let order = shuffleInPlace(puzzles.slice(), seed);
  let i = 0;
  return {
    get size() { return puzzles.length; },
    get position() { return i; },
    next() {
      if (!order.length) return null;
      if (i >= order.length) {
        order = shuffleInPlace(order, seed + i);
        i = 0;
      }
      return order[i++];
    },
    peek() { return i < order.length ? order[i] : null; },
  };
}

function shuffleInPlace(arr, seed) {
  let a = seed >>> 0;
  const rand = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
