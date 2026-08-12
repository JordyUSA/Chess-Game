/**
 * Local-date arithmetic, in one place.
 *
 * Every date in this app is a 'YYYY-MM-DD' key in the player's OWN timezone, so
 * "today's puzzle" flips at their midnight rather than UTC's. All the fiddly
 * parts — DST days that are 23 or 25 hours long, month and year rollovers — are
 * confined here so they can be tested once instead of being re-derived at every
 * call site.
 */

/** 'YYYY-MM-DD' for a Date (default: now), in local time. */
export function toKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Local midnight Date for a key. */
export function fromKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function today() {
  return toKey();
}

/** Shifts a key by n days (n may be negative). Handles month/year rollover. */
export function addDays(key, n) {
  const d = fromKey(key);
  d.setDate(d.getDate() + n);
  return toKey(d);
}

/**
 * Whole days from `a` to `b` (negative if b is earlier).
 * Rounding absorbs the 23/25-hour DST days, which a plain division would not.
 */
export function diffDays(a, b) {
  return Math.round((fromKey(b) - fromKey(a)) / 86400000);
}

export function isBeforeOrEqual(a, b) {
  return diffDays(a, b) >= 0;
}

/** "12 Aug 2026" */
export function formatKey(key) {
  return fromKey(key).toLocaleDateString(undefined, {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}
