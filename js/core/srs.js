/**
 * Spaced repetition for puzzles you got wrong.
 *
 * A Leitner box system, not SM-2. Puzzle recall is effectively binary — you
 * either saw the tactic or you did not — and SM-2 needs a 0-5 quality grade to
 * be worth its extra machinery. Inventing one here would add complexity without
 * adding accuracy, so five fixed boxes it is.
 *
 *   box 1 -> tomorrow      box 4 -> 8 days
 *   box 2 -> 2 days        box 5 -> 16 days, then retired
 *   box 3 -> 4 days
 *
 * Miss a puzzle (or need a hint) and it drops back to box 1.
 */

import { today, addDays, diffDays } from './dates.js';
import { getSrs, saveSrs } from './store.js';

export const INTERVALS = [1, 2, 4, 8, 16];
export const MAX_BOX = INTERVALS.length;

/** Grades an attempt and returns the updated record. Pure — see `record`. */
export function schedule(existing, { solvedCleanly, on = today() }) {
  const prev = existing || { box: 0, misses: 0, seen: 0 };
  const box = solvedCleanly ? Math.min(MAX_BOX, (prev.box || 0) + 1) : 1;
  return {
    box,
    due: addDays(on, INTERVALS[box - 1]),
    misses: (prev.misses || 0) + (solvedCleanly ? 0 : 1),
    seen: (prev.seen || 0) + 1,
    lastSeen: on,
    // Box 5 solved cleanly means it is learned; stop resurfacing it.
    retired: solvedCleanly && box === MAX_BOX,
  };
}

/**
 * Records an attempt.
 *
 * Only puzzles the player actually struggled with enter the system. A puzzle
 * solved cleanly on the first encounter was never a gap worth reviewing, and
 * enrolling everything would bury the genuinely weak spots.
 */
export function record(puzzleId, { solvedCleanly, on = today() } = {}) {
  const map = getSrs();
  const existing = map[puzzleId];
  if (!existing && solvedCleanly) return null;

  const next = schedule(existing, { solvedCleanly, on });
  if (next.retired) {
    delete map[puzzleId];
  } else {
    map[puzzleId] = next;
  }
  saveSrs(map);
  return next;
}

/** Puzzle ids due on or before `on`, most overdue first. */
export function dueIds(on = today(), map = getSrs()) {
  return Object.entries(map)
    .filter(([, rec]) => rec && rec.due && diffDays(rec.due, on) >= 0)
    .sort((a, b) => diffDays(b[1].due, a[1].due))
    .map(([id]) => id);
}

export function dueCount(on = today(), map = getSrs()) {
  return dueIds(on, map).length;
}

/** How many puzzles are enrolled but not yet due. */
export function pendingCount(on = today(), map = getSrs()) {
  return Object.values(map).filter((r) => r && r.due && diffDays(r.due, on) < 0).length;
}

export function summary(on = today()) {
  const map = getSrs();
  const boxes = [0, 0, 0, 0, 0];
  for (const rec of Object.values(map)) {
    if (rec && rec.box >= 1 && rec.box <= MAX_BOX) boxes[rec.box - 1]++;
  }
  return {
    tracked: Object.keys(map).length,
    due: dueCount(on, map),
    pending: pendingCount(on, map),
    boxes,
  };
}
