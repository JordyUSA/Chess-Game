/**
 * Chess rules adapter.
 *
 * The ONLY module that imports the vendored chess.js. Everything else talks to
 * the game through this surface, which keeps the engine swappable and lets the
 * pure-logic modules stay easy to test under `node --test`.
 *
 * Convention: positions are FEN strings, moves are UCI strings ("e2e4", "e7e8q").
 * UCI is what the Lichess puzzle database uses, so it is the lingua franca here.
 */

import { Chess } from '../../vendor/chess.js';

export const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
export const RANKS = ['1', '2', '3', '4', '5', '6', '7', '8'];

/** All 64 squares, a8 -> h1 (visual order for a white-oriented board). */
export const SQUARES = (() => {
  const out = [];
  for (let r = 7; r >= 0; r--) for (let f = 0; f < 8; f++) out.push(FILES[f] + RANKS[r]);
  return out;
})();

export const PIECE_NAMES = {
  p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king',
};

export function newGame(fen) {
  return fen ? new Chess(fen) : new Chess();
}

export function parseUci(uci) {
  return {
    from: uci.slice(0, 2),
    to: uci.slice(2, 4),
    promotion: uci.length > 4 ? uci[4] : undefined,
  };
}

export function toUci(move) {
  return move.from + move.to + (move.promotion || '');
}

/**
 * Plays a UCI move. Returns the chess.js move object, or null if illegal.
 * Never throws — callers routinely try moves that turn out to be illegal.
 */
export function applyUci(game, uci) {
  const { from, to, promotion } = parseUci(uci);
  try {
    return game.move({ from, to, promotion: promotion || 'q' });
  } catch {
    return null;
  }
}

/** Legal destination squares for the piece on `from`. */
export function legalTargets(game, from) {
  try {
    return game.moves({ square: from, verbose: true }).map((m) => m.to);
  } catch {
    return [];
  }
}

/** Every legal move in the position, as UCI strings. */
export function legalUcis(game) {
  return game.moves({ verbose: true }).map(toUci);
}

/** Would moving from -> to be a pawn promotion? */
export function isPromotion(game, from, to) {
  const piece = game.get(from);
  if (!piece || piece.type !== 'p') return false;
  const rank = to[1];
  return (piece.color === 'w' && rank === '8') || (piece.color === 'b' && rank === '1');
}

/** 64 entries in visual order (a8 first): { square, piece } where piece may be null. */
export function boardSquares(game) {
  return SQUARES.map((square) => ({ square, piece: game.get(square) || null }));
}

/** The square the side to move has its king on, when in check. Else null. */
export function checkedKingSquare(game) {
  if (!game.inCheck()) return null;
  const turn = game.turn();
  for (const square of SQUARES) {
    const p = game.get(square);
    if (p && p.type === 'k' && p.color === turn) return square;
  }
  return null;
}

export function status(game) {
  return {
    turn: game.turn(),
    inCheck: game.inCheck(),
    isCheckmate: game.isCheckmate(),
    isStalemate: game.isStalemate(),
    isDraw: game.isDraw(),
    isGameOver: game.isGameOver(),
  };
}

/**
 * Human-readable name for a square, for screen readers.
 * "e4, white knight" / "e4, empty"
 */
export function describeSquare(square, piece) {
  if (!piece) return `${square}, empty`;
  const colour = piece.color === 'w' ? 'white' : 'black';
  return `${square}, ${colour} ${PIECE_NAMES[piece.type]}`;
}

/** Count of pieces on the board — used to size the "pocket" focus region. */
export function pieceCount(fen) {
  const board = fen.slice(0, fen.indexOf(' '));
  let n = 0;
  for (const ch of board) if (/[a-zA-Z]/.test(ch)) n++;
  return n;
}

/**
 * The squares focus mode keeps lit: everything occupied or touched by the
 * solution, plus a one-square halo around each.
 *
 * This started as a bounding box, which turned out to be useless — a single
 * rook swinging from a1 to a8 stretches the box over the whole board, so
 * nothing ever dimmed. Proximity to actual material tracks where the tactic
 * lives far better, and it produces an organic shape rather than a rectangle.
 *
 * Only ever used for dimming. The board is never cropped: a rook two files
 * outside the lit area still defends, and hiding it would misrepresent the
 * position.
 *
 * @returns {Set<string>} squares to keep at full strength
 */
export function focusSquares(fen, ucis = []) {
  const game = newGame(fen);
  const seeds = new Set();

  for (const square of SQUARES) {
    if (game.get(square)) seeds.add(square);
  }
  for (const uci of ucis) {
    seeds.add(uci.slice(0, 2));
    seeds.add(uci.slice(2, 4));
  }

  const live = new Set();
  for (const square of seeds) {
    const f = FILES.indexOf(square[0]);
    const r = RANKS.indexOf(square[1]);
    if (f < 0 || r < 0) continue;
    for (let df = -1; df <= 1; df++) {
      for (let dr = -1; dr <= 1; dr++) {
        const nf = f + df;
        const nr = r + dr;
        if (nf < 0 || nf > 7 || nr < 0 || nr > 7) continue;
        live.add(FILES[nf] + RANKS[nr]);
      }
    }
  }
  return live;
}
