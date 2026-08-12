/**
 * Main-thread handle for the search worker.
 *
 * Lazily spawns the worker on first use so puzzle-only sessions never pay for
 * it, and serialises requests: one search at a time, with any in-flight search
 * cancelled when a new position arrives.
 */

let worker = null;
let pending = null;
let seq = 0;

function ensureWorker() {
  if (worker) return worker;
  worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
  worker.onmessage = (event) => {
    const msg = event.data || {};
    if (!pending) return;
    const { resolve, reject } = pending;
    pending = null;
    if (msg.type === 'bestmove') resolve(msg);
    else if (msg.type === 'error') reject(new Error(msg.message));
  };
  worker.onerror = (err) => {
    if (pending) {
      pending.reject(err instanceof Error ? err : new Error('Engine failed'));
      pending = null;
    }
  };
  return worker;
}

/**
 * Best move for a position.
 * @param {string} fen
 * @param {{level?:number, depth?:number, movetimeMs?:number}} opts
 * @returns {Promise<{uci:string|null, score:number, depth:number, nodes:number}>}
 */
export function bestMove(fen, opts = {}) {
  const w = ensureWorker();
  if (pending) {
    w.postMessage({ type: 'stop' });
    pending.resolve({ uci: null, score: 0, depth: 0, nodes: 0, cancelled: true });
    pending = null;
  }
  const id = ++seq;
  return new Promise((resolve, reject) => {
    pending = { id, resolve, reject };
    w.postMessage({ type: 'go', fen, ...opts });
  });
}

export function stop() {
  if (worker) worker.postMessage({ type: 'stop' });
}

export function terminate() {
  if (worker) {
    worker.terminate();
    worker = null;
    pending = null;
  }
}

/** Warms the worker up so the first move is not delayed by module loading. */
export function preload() {
  ensureWorker();
}
