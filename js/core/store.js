/**
 * Versioned localStorage.
 *
 * Keys are namespaced 'pc:v1:*' so a future schema change can migrate rather
 * than collide. Every read is defensive: a corrupt or hand-edited value must
 * degrade to defaults, never throw on boot. Storage may also be unavailable
 * entirely (private mode, disabled cookies), so writes are best-effort and the
 * app keeps working from memory.
 */

const NS = 'pc:v1:';

let fallbackStore = null;

/** A Storage-shaped object over a Map, for when localStorage is unavailable. */
function createMemoryStore() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
  };
}

function backing() {
  if (fallbackStore) return fallbackStore;
  try {
    const probe = '__pc_probe__';
    localStorage.setItem(probe, '1');
    localStorage.removeItem(probe);
    return localStorage;
  } catch {
    // Private mode, blocked cookies, or a non-browser host such as the test
    // runner. Cache the shim itself — caching the bare Map would hand callers
    // an object with no getItem/setItem and silently lose every write.
    fallbackStore = createMemoryStore();
    return fallbackStore;
  }
}

function read(key, fallback) {
  try {
    const raw = backing().getItem(NS + key);
    if (raw == null) return structuredClone(fallback);
    const parsed = JSON.parse(raw);
    if (parsed == null || typeof parsed !== typeof fallback) return structuredClone(fallback);
    return parsed;
  } catch {
    return structuredClone(fallback);
  }
}

function write(key, value) {
  try {
    backing().setItem(NS + key, JSON.stringify(value));
    return true;
  } catch {
    return false; // quota exceeded, or storage blocked
  }
}

// -- profile ---------------------------------------------------------------

const DEFAULT_PROFILE = {
  created: null,
  prefs: {
    theme: 'system',      // 'system' | 'light' | 'dark'
    boardTheme: 'sage',   // sage | wood | slate | mint | contrast
    pieceSet: 'cburnett', // see PIECE_SETS in js/ui/pieces.js
    sound: true,
    haptics: true,
    focusMode: true,
    coordinates: true,
    aiLevel: 3,
  },
  stats: { solved: 0, attempts: 0, hintsUsed: 0, clean: 0 },
};

export function getProfile() {
  const p = read('profile', DEFAULT_PROFILE);
  p.prefs = { ...DEFAULT_PROFILE.prefs, ...(p.prefs || {}) };
  p.stats = { ...DEFAULT_PROFILE.stats, ...(p.stats || {}) };
  return p;
}

export function saveProfile(profile) {
  return write('profile', profile);
}

export function updatePrefs(patch) {
  const p = getProfile();
  p.prefs = { ...p.prefs, ...patch };
  saveProfile(p);
  return p.prefs;
}

export function recordSolve({ clean, hints, attempts }) {
  const p = getProfile();
  if (!p.created) p.created = new Date().toISOString().slice(0, 10);
  p.stats.solved += 1;
  p.stats.attempts += attempts || 0;
  p.stats.hintsUsed += hints || 0;
  if (clean) p.stats.clean += 1;
  saveProfile(p);
  return p.stats;
}

// -- streak ----------------------------------------------------------------

const DEFAULT_STREAK = { current: 0, best: 0, lastDate: null, days: [] };

export function getStreak() {
  return { ...DEFAULT_STREAK, ...read('streak', DEFAULT_STREAK) };
}

export function saveStreak(streak) {
  return write('streak', streak);
}

// -- spaced repetition -----------------------------------------------------

export function getSrs() {
  return read('srs', {});
}

export function saveSrs(map) {
  return write('srs', map);
}

// -- history ---------------------------------------------------------------

const HISTORY_CAP = 400;

export function getHistory() {
  const h = read('history', []);
  return Array.isArray(h) ? h : [];
}

export function pushHistory(entry) {
  const h = getHistory();
  h.unshift(entry);
  if (h.length > HISTORY_CAP) h.length = HISTORY_CAP;
  write('history', h);
  return h;
}

// -- maintenance -----------------------------------------------------------

export function resetAll() {
  for (const key of ['profile', 'streak', 'srs', 'history']) {
    try { backing().removeItem(NS + key); } catch { /* ignore */ }
  }
}

export function exportAll() {
  return {
    version: 1,
    exported: new Date().toISOString(),
    profile: getProfile(),
    streak: getStreak(),
    srs: getSrs(),
    history: getHistory(),
  };
}
