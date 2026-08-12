/**
 * The daily puzzle, and the streak it feeds.
 *
 * Everyone gets the same puzzle on the same calendar day with no server
 * involved: the date seeds the selection. Rather than hashing the date straight
 * into an index — which collides often enough to repeat puzzles within weeks —
 * each cycle of `poolSize` days gets its own seeded permutation of the pool, so
 * no puzzle repeats until the whole pool has been used.
 */

import { mulberry32, hashString, shuffled } from './rng.js';
import { today, addDays, diffDays, formatKey } from './dates.js';
import { getStreak, saveStreak } from './store.js';

/** Anchor for cycle arithmetic. Any fixed past date works; this one is stable. */
export const EPOCH = '2026-01-01';

/**
 * Index into the daily pool for a given date.
 * Deterministic: same date + same pool size always gives the same index.
 */
export function dailyIndex(dateKey, poolSize) {
  if (!poolSize) return 0;
  const n = diffDays(EPOCH, dateKey);
  // Floor division so dates before the epoch still land in-range.
  const cycle = Math.floor(n / poolSize);
  const offset = ((n % poolSize) + poolSize) % poolSize;
  const order = shuffled(
    Array.from({ length: poolSize }, (_, i) => i),
    hashString(`pc-daily-${cycle}`)
  );
  return order[offset];
}

export function pickDaily(pool, dateKey = today()) {
  if (!pool || !pool.length) return null;
  return pool[dailyIndex(dateKey, pool.length)];
}

// -- streak ----------------------------------------------------------------

/** A streak only counts as running if it was fed today or yesterday. */
export function isStreakAlive(streak, on = today()) {
  if (!streak.lastDate || !streak.current) return false;
  const gap = diffDays(streak.lastDate, on);
  return gap === 0 || gap === 1;
}

/** Current streak, shown as 0 once it has lapsed. */
export function displayStreak(streak, on = today()) {
  return isStreakAlive(streak, on) ? streak.current : 0;
}

/**
 * Records a solved daily. Idempotent for the same day — opening the daily twice
 * must not double-count it.
 */
export function registerDailySolve(dateKey = today()) {
  const s = getStreak();
  if (s.lastDate === dateKey) return s;

  s.current = s.lastDate && diffDays(s.lastDate, dateKey) === 1 ? (s.current || 0) + 1 : 1;
  s.best = Math.max(s.best || 0, s.current);
  s.lastDate = dateKey;
  s.days = [...(s.days || []), dateKey].slice(-180);
  saveStreak(s);
  return s;
}

export function solvedOn(dateKey, streak = getStreak()) {
  return (streak.days || []).includes(dateKey);
}

// -- sharing ---------------------------------------------------------------

/**
 * A spoiler-free result card.
 *
 * Deliberately leaks nothing about the position — no FEN, no moves, not even
 * the piece that mates. The squares encode how it went: green for a clean
 * move, yellow for one that needed a retry or a hint.
 */
export function shareText({ dateKey, mateIn, attempts, hints, streak, solved = true }) {
  const label = mateIn ? `Mate in ${mateIn}` : 'Tactic';
  const moves = mateIn || 1;
  const marks = [];
  for (let i = 0; i < moves; i++) {
    if (!solved) marks.push('⬜');
    else if (i === 0 && (attempts > 0 || hints > 0)) marks.push('🟨');
    else marks.push('🟩');
  }

  const lines = [`Pocket Chess · ${formatKey(dateKey)}`];
  if (solved) {
    const bits = [label];
    bits.push(attempts === 0 ? 'first try' : `${attempts + 1} tries`);
    if (hints > 0) bits.push(hints === 1 ? '1 hint' : `${hints} hints`);
    lines.push(bits.join(' — '));
  } else {
    lines.push(`${label} — unsolved`);
  }
  lines.push(streak > 0 ? `${marks.join('')}  ·  streak ${streak} 🔥` : marks.join(''));
  return lines.join('\n');
}

/** Last `n` days as { key, solved } — feeds the calendar heatmap. */
export function recentDays(n = 28, on = today(), streak = getStreak()) {
  const days = new Set(streak.days || []);
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const key = addDays(on, -i);
    out.push({ key, solved: days.has(key) });
  }
  return out;
}

export { mulberry32 };
