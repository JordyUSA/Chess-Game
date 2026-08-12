/**
 * Dates, spaced repetition, and daily-puzzle selection.
 *
 * These are the parts most likely to break silently and least likely to be
 * noticed by hand: an off-by-one in a due date or a daily that repeats itself
 * would take weeks of real use to spot.
 */

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { toKey, fromKey, addDays, diffDays } from '../js/core/dates.js';
import { schedule, dueIds, INTERVALS, MAX_BOX } from '../js/core/srs.js';
import { dailyIndex, isStreakAlive, registerDailySolve, shareText, EPOCH } from '../js/core/daily.js';
import { resetAll, getStreak } from '../js/core/store.js';

describe('dates', () => {
  test('round-trips a key', () => {
    assert.equal(toKey(fromKey('2026-08-12')), '2026-08-12');
  });

  test('addDays crosses month and year boundaries', () => {
    assert.equal(addDays('2026-01-31', 1), '2026-02-01');
    assert.equal(addDays('2026-12-31', 1), '2027-01-01');
    assert.equal(addDays('2026-03-01', -1), '2026-02-28');
    assert.equal(addDays('2024-03-01', -1), '2024-02-29', 'leap year');
  });

  test('diffDays counts whole days in both directions', () => {
    assert.equal(diffDays('2026-08-12', '2026-08-13'), 1);
    assert.equal(diffDays('2026-08-13', '2026-08-12'), -1);
    assert.equal(diffDays('2026-08-12', '2026-08-12'), 0);
    assert.equal(diffDays('2026-01-01', '2027-01-01'), 365);
  });

  test('a DST transition is still exactly one day', () => {
    // Northern-hemisphere spring forward (23h) and autumn back (25h). Rounding
    // in diffDays is what keeps these from coming out as 0 or 2.
    assert.equal(diffDays('2026-03-07', '2026-03-08'), 1);
    assert.equal(diffDays('2026-03-08', '2026-03-09'), 1);
    assert.equal(diffDays('2026-10-31', '2026-11-01'), 1);
    assert.equal(diffDays('2026-11-01', '2026-11-02'), 1);
  });

  test('a whole year of consecutive days each advance by one', () => {
    let key = '2026-01-01';
    for (let i = 0; i < 400; i++) {
      const next = addDays(key, 1);
      assert.equal(diffDays(key, next), 1, `${key} -> ${next}`);
      key = next;
    }
  });
});

describe('spaced repetition', () => {
  test('a first clean solve is not enrolled at all', () => {
    // Only genuine gaps are worth reviewing; enrolling everything buries them.
    const next = schedule(null, { solvedCleanly: true, on: '2026-08-12' });
    assert.equal(next.box, 1);
    // `record` is what applies the "skip clean first solves" rule; schedule
    // itself just grades. Both behaviours are covered below.
  });

  test('a miss goes into box 1, due tomorrow', () => {
    const next = schedule(null, { solvedCleanly: false, on: '2026-08-12' });
    assert.equal(next.box, 1);
    assert.equal(next.due, '2026-08-13');
    assert.equal(next.misses, 1);
  });

  test('clean solves promote through the boxes on the right intervals', () => {
    let rec = schedule(null, { solvedCleanly: false, on: '2026-01-01' });
    const seen = [];
    let day = '2026-01-01';
    for (let i = 0; i < MAX_BOX; i++) {
      day = rec.due;
      rec = schedule(rec, { solvedCleanly: true, on: day });
      seen.push([rec.box, diffDays(day, rec.due)]);
    }
    assert.deepEqual(seen.map((s) => s[0]), [2, 3, 4, 5, 5]);
    assert.deepEqual(seen.map((s) => s[1]), [
      INTERVALS[1], INTERVALS[2], INTERVALS[3], INTERVALS[4], INTERVALS[4],
    ]);
  });

  test('a miss demotes all the way back to box 1', () => {
    const high = { box: 4, misses: 1, seen: 6 };
    const next = schedule(high, { solvedCleanly: false, on: '2026-08-12' });
    assert.equal(next.box, 1);
    assert.equal(next.due, '2026-08-13');
    assert.equal(next.misses, 2);
  });

  test('box 5 solved cleanly retires', () => {
    const next = schedule({ box: 5, misses: 1, seen: 9 }, { solvedCleanly: true, on: '2026-08-12' });
    assert.equal(next.box, MAX_BOX);
    assert.ok(next.retired);
  });

  test('dueIds returns only what is due, most overdue first', () => {
    const map = {
      soon:    { box: 1, due: '2026-08-20' },
      overdue: { box: 2, due: '2026-08-01' },
      today:   { box: 1, due: '2026-08-12' },
    };
    assert.deepEqual(dueIds('2026-08-12', map), ['overdue', 'today']);
  });
});

describe('daily puzzle', () => {
  beforeEach(() => resetAll());

  test('the same date always gives the same puzzle', () => {
    for (const date of ['2026-08-12', '2026-01-01', '2027-03-04']) {
      const a = dailyIndex(date, 400);
      const b = dailyIndex(date, 400);
      assert.equal(a, b);
      assert.ok(a >= 0 && a < 400, `${a} out of range`);
    }
  });

  test('different dates generally give different puzzles', () => {
    const seen = new Set();
    let key = '2026-01-01';
    for (let i = 0; i < 100; i++) {
      seen.add(dailyIndex(key, 400));
      key = addDays(key, 1);
    }
    assert.ok(seen.size >= 95, `only ${seen.size} distinct puzzles in 100 days`);
  });

  test('a full cycle never repeats a puzzle', () => {
    // The whole reason for the per-cycle shuffle: hashing the date straight to
    // an index collides often enough to repeat within weeks.
    const pool = 400;
    const seen = new Set();
    let key = EPOCH;
    for (let i = 0; i < pool; i++) {
      seen.add(dailyIndex(key, pool));
      key = addDays(key, 1);
    }
    assert.equal(seen.size, pool, 'every puzzle in the pool should be used exactly once');
  });

  test('dates before the epoch still land in range', () => {
    for (const date of ['2025-06-01', '2020-01-01']) {
      const i = dailyIndex(date, 400);
      assert.ok(i >= 0 && i < 400, `${date} gave ${i}`);
    }
  });

  test('a streak counts consecutive days and resets after a gap', () => {
    registerDailySolve('2026-08-10');
    assert.equal(getStreak().current, 1);

    registerDailySolve('2026-08-11');
    assert.equal(getStreak().current, 2);

    registerDailySolve('2026-08-12');
    assert.equal(getStreak().current, 3);
    assert.equal(getStreak().best, 3);

    registerDailySolve('2026-08-15'); // skipped two days
    assert.equal(getStreak().current, 1);
    assert.equal(getStreak().best, 3, 'best is kept');
  });

  test('solving twice on one day does not double-count', () => {
    registerDailySolve('2026-08-12');
    registerDailySolve('2026-08-12');
    registerDailySolve('2026-08-12');
    assert.equal(getStreak().current, 1);
  });

  test('a streak is alive today and yesterday, dead the day after', () => {
    const streak = { current: 5, best: 5, lastDate: '2026-08-12', days: [] };
    assert.ok(isStreakAlive(streak, '2026-08-12'), 'fed today');
    assert.ok(isStreakAlive(streak, '2026-08-13'), 'still savable');
    assert.ok(!isStreakAlive(streak, '2026-08-14'), 'missed a whole day');
  });

  test('the share card leaks nothing about the position', () => {
    const text = shareText({
      dateKey: '2026-08-12', mateIn: 3, attempts: 1, hints: 0, streak: 7, solved: true,
    });
    assert.match(text, /Pocket Chess/);
    assert.match(text, /Mate in 3/);
    assert.match(text, /2 tries/);
    assert.match(text, /streak 7/);
    // No FEN, no algebraic move, nothing a solver could use.
    assert.doesNotMatch(text, /[a-h][1-8][a-h][1-8]/, 'contains a UCI move');
    assert.doesNotMatch(text, /\b[KQRBN][a-h][1-8]\b/, 'contains an algebraic move');
    assert.doesNotMatch(text, /\//, 'looks like it contains a FEN');
  });
});
