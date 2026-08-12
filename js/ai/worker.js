/**
 * The engine, in a Web Worker so search never blocks the board.
 *
 * Negamax + alpha-beta, iterative deepening under a time budget, MVV-LVA and
 * killer-move ordering, and a quiescence search so it stops hanging pieces at
 * the horizon.
 *
 * Deliberately not Stockfish: the threaded WASM build needs SharedArrayBuffer,
 * which needs COOP/COEP response headers, which GitHub Pages cannot send. The
 * single-threaded build is multi-megabyte and would dominate the offline cache
 * of a game whose whole premise is being small. A few hundred lines here play
 * far better than this game needs.
 *
 * Protocol:
 *   in   { type:'go', fen, level, movetimeMs }   { type:'stop' }
 *   out  { type:'bestmove', uci, score, depth, nodes }
 */

import { Chess } from '../../vendor/chess.js';
import { evaluate, mvvLva, PIECE_VALUE } from './eval.js';

const MATE = 100000;
const MAX_PLY = 64;

/** Difficulty levels: search budget plus a chance of picking a worse move. */
const LEVELS = {
  1: { depth: 1, movetime: 120,  blunder: 0.55, spread: 3 },
  2: { depth: 2, movetime: 260,  blunder: 0.34, spread: 3 },
  3: { depth: 3, movetime: 650,  blunder: 0.16, spread: 2 },
  4: { depth: 4, movetime: 1200, blunder: 0.05, spread: 2 },
  5: { depth: 6, movetime: 2200, blunder: 0,    spread: 1 },
};

let stopRequested = false;
let deadline = 0;
let nodes = 0;
const killers = Array.from({ length: MAX_PLY }, () => []);

class Timeout extends Error {}

function checkTime() {
  // Polling every 2048 nodes keeps the clock check off the hot path.
  if ((nodes & 2047) === 0) {
    if (stopRequested || Date.now() > deadline) throw new Timeout();
  }
}

function orderMoves(moves, ply) {
  const killerList = killers[ply] || [];
  return moves
    .map((m) => {
      let score = mvvLva(m);
      if (m.promotion) score += PIECE_VALUE[m.promotion] * 8;
      if (!m.captured && killerList.includes(m.from + m.to)) score += 900;
      return { m, score };
    })
    .sort((a, b) => b.score - a.score)
    .map((x) => x.m);
}

/** Search captures only, so the evaluation is never taken mid-exchange. */
function quiesce(game, alpha, beta) {
  nodes++;
  checkTime();

  const stand = evaluate(game);
  if (stand >= beta) return beta;
  if (stand > alpha) alpha = stand;

  const captures = game.moves({ verbose: true }).filter((m) => m.captured || m.promotion);
  for (const move of orderMoves(captures, 0)) {
    game.move(move);
    const score = -quiesce(game, -beta, -alpha);
    game.undo();
    if (score >= beta) return beta;
    if (score > alpha) alpha = score;
  }
  return alpha;
}

function negamax(game, depth, alpha, beta, ply) {
  nodes++;
  checkTime();

  if (game.isDraw()) return 0;

  const moves = game.moves({ verbose: true });
  if (!moves.length) {
    // Mate scores include the ply so the engine prefers the quicker mate.
    return game.inCheck() ? -MATE + ply : 0;
  }
  if (depth <= 0) return quiesce(game, alpha, beta);

  let best = -Infinity;
  for (const move of orderMoves(moves, ply)) {
    game.move(move);
    const score = -negamax(game, depth - 1, -beta, -alpha, ply + 1);
    game.undo();

    if (score > best) best = score;
    if (score > alpha) alpha = score;
    if (alpha >= beta) {
      if (!move.captured) {
        const key = move.from + move.to;
        const list = killers[ply];
        if (!list.includes(key)) {
          list.unshift(key);
          if (list.length > 2) list.pop();
        }
      }
      break;
    }
  }
  return best;
}

/** Root search with iterative deepening. Returns every root move, scored. */
function searchRoot(fen, maxDepth, movetimeMs) {
  const game = new Chess(fen);
  const rootMoves = game.moves({ verbose: true });
  if (!rootMoves.length) return { scored: [], depth: 0 };

  nodes = 0;
  deadline = Date.now() + movetimeMs;
  for (const list of killers) list.length = 0;

  let scored = rootMoves.map((m) => ({ move: m, score: -Infinity }));
  let completedDepth = 0;

  for (let depth = 1; depth <= maxDepth; depth++) {
    const results = [];
    try {
      // Search the previous iteration's best first — better pruning.
      const ordered = [...scored].sort((a, b) => b.score - a.score).map((s) => s.move);
      let alpha = -Infinity;
      for (const move of ordered) {
        game.move(move);
        const score = -negamax(game, depth - 1, -Infinity, -alpha, 1);
        game.undo();
        results.push({ move, score });
        if (score > alpha) alpha = score;
      }
    } catch (err) {
      if (!(err instanceof Timeout)) throw err;
      break; // keep the last completed depth
    }
    scored = results;
    completedDepth = depth;
    if (Date.now() > deadline) break;
  }

  scored.sort((a, b) => b.score - a.score);
  return { scored, depth: completedDepth };
}

function toUci(move) {
  return move.from + move.to + (move.promotion || '');
}

/**
 * Picks the move to actually play.
 *
 * Weaker levels occasionally choose the 2nd or 3rd best move rather than
 * searching shallower. A shallow search plays with an alien, jerky style; a
 * good search that sometimes errs feels like a weaker human.
 */
function chooseMove(scored, level) {
  if (!scored.length) return null;
  const cfg = LEVELS[level] || LEVELS[3];
  if (cfg.blunder > 0 && Math.random() < cfg.blunder && scored.length > 1) {
    const pool = scored.slice(0, Math.min(cfg.spread + 1, scored.length));
    return pool[1 + Math.floor(Math.random() * (pool.length - 1))] || scored[0];
  }
  return scored[0];
}

self.onmessage = (event) => {
  const msg = event.data || {};

  if (msg.type === 'stop') {
    stopRequested = true;
    return;
  }

  if (msg.type !== 'go') return;

  stopRequested = false;
  const cfg = LEVELS[msg.level] || LEVELS[3];
  const depth = msg.depth || cfg.depth;
  const movetime = msg.movetimeMs || cfg.movetime;

  try {
    const { scored, depth: reached } = searchRoot(msg.fen, depth, movetime);
    const pick = chooseMove(scored, msg.level || 3);
    self.postMessage({
      type: 'bestmove',
      uci: pick ? toUci(pick.move) : null,
      score: pick ? pick.score : 0,
      depth: reached,
      nodes,
    });
  } catch (err) {
    self.postMessage({ type: 'error', message: String(err && err.message ? err.message : err) });
  }
};
