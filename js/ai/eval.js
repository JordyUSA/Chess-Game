/**
 * Static evaluation: material plus piece-square tables.
 *
 * Tables are written from White's point of view with a8 first (the same order
 * chess.js reports its board), and mirrored vertically for Black. Values are in
 * centipawns. The king has two tables — in the middlegame it wants to stay
 * tucked away, in the endgame it wants to walk to the centre — blended by how
 * much material is left.
 */

export const PIECE_VALUE = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };

const PAWN = [
   0,  0,  0,  0,  0,  0,  0,  0,
  50, 50, 50, 50, 50, 50, 50, 50,
  10, 10, 20, 30, 30, 20, 10, 10,
   5,  5, 10, 25, 25, 10,  5,  5,
   0,  0,  0, 20, 20,  0,  0,  0,
   5, -5,-10,  0,  0,-10, -5,  5,
   5, 10, 10,-20,-20, 10, 10,  5,
   0,  0,  0,  0,  0,  0,  0,  0,
];

const KNIGHT = [
 -50,-40,-30,-30,-30,-30,-40,-50,
 -40,-20,  0,  0,  0,  0,-20,-40,
 -30,  0, 10, 15, 15, 10,  0,-30,
 -30,  5, 15, 20, 20, 15,  5,-30,
 -30,  0, 15, 20, 20, 15,  0,-30,
 -30,  5, 10, 15, 15, 10,  5,-30,
 -40,-20,  0,  5,  5,  0,-20,-40,
 -50,-40,-30,-30,-30,-30,-40,-50,
];

const BISHOP = [
 -20,-10,-10,-10,-10,-10,-10,-20,
 -10,  0,  0,  0,  0,  0,  0,-10,
 -10,  0,  5, 10, 10,  5,  0,-10,
 -10,  5,  5, 10, 10,  5,  5,-10,
 -10,  0, 10, 10, 10, 10,  0,-10,
 -10, 10, 10, 10, 10, 10, 10,-10,
 -10,  5,  0,  0,  0,  0,  5,-10,
 -20,-10,-10,-10,-10,-10,-10,-20,
];

const ROOK = [
   0,  0,  0,  0,  0,  0,  0,  0,
   5, 10, 10, 10, 10, 10, 10,  5,
  -5,  0,  0,  0,  0,  0,  0, -5,
  -5,  0,  0,  0,  0,  0,  0, -5,
  -5,  0,  0,  0,  0,  0,  0, -5,
  -5,  0,  0,  0,  0,  0,  0, -5,
  -5,  0,  0,  0,  0,  0,  0, -5,
   0,  0,  0,  5,  5,  0,  0,  0,
];

const QUEEN = [
 -20,-10,-10, -5, -5,-10,-10,-20,
 -10,  0,  0,  0,  0,  0,  0,-10,
 -10,  0,  5,  5,  5,  5,  0,-10,
  -5,  0,  5,  5,  5,  5,  0, -5,
   0,  0,  5,  5,  5,  5,  0, -5,
 -10,  5,  5,  5,  5,  5,  0,-10,
 -10,  0,  5,  0,  0,  0,  0,-10,
 -20,-10,-10, -5, -5,-10,-10,-20,
];

const KING_MID = [
 -30,-40,-40,-50,-50,-40,-40,-30,
 -30,-40,-40,-50,-50,-40,-40,-30,
 -30,-40,-40,-50,-50,-40,-40,-30,
 -30,-40,-40,-50,-50,-40,-40,-30,
 -20,-30,-30,-40,-40,-30,-30,-20,
 -10,-20,-20,-20,-20,-20,-20,-10,
  20, 20,  0,  0,  0,  0, 20, 20,
  20, 30, 10,  0,  0, 10, 30, 20,
];

const KING_END = [
 -50,-40,-30,-20,-20,-30,-40,-50,
 -30,-20,-10,  0,  0,-10,-20,-30,
 -30,-10, 20, 30, 30, 20,-10,-30,
 -30,-10, 30, 40, 40, 30,-10,-30,
 -30,-10, 30, 40, 40, 30,-10,-30,
 -30,-10, 20, 30, 30, 20,-10,-30,
 -30,-30,  0,  0,  0,  0,-30,-30,
 -50,-30,-30,-30,-30,-30,-30,-50,
];

const TABLES = { p: PAWN, n: KNIGHT, b: BISHOP, r: ROOK, q: QUEEN };

/** Total non-pawn, non-king material, used to blend the king tables. */
const PHASE_MAX = 2 * (2 * 320 + 2 * 330 + 2 * 500 + 900);

/**
 * Score for the side to move, in centipawns.
 * @param {import('../../vendor/chess.js').Chess} game
 */
export function evaluate(game) {
  const board = game.board(); // rank 8 first, files a-h
  let score = 0;
  let phase = 0;

  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const piece = board[r][f];
      if (!piece) continue;
      const idx = r * 8 + f;                       // white's view
      const mirrored = (7 - r) * 8 + f;            // black's view
      const at = piece.color === 'w' ? idx : mirrored;

      let value = PIECE_VALUE[piece.type];
      if (piece.type !== 'k') {
        value += TABLES[piece.type][at];
        if (piece.type !== 'p') phase += PIECE_VALUE[piece.type];
      }
      score += piece.color === 'w' ? value : -value;
    }
  }

  // King safety vs king activity, blended on remaining material.
  const endgameWeight = 1 - Math.min(1, phase / PHASE_MAX);
  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const piece = board[r][f];
      if (!piece || piece.type !== 'k') continue;
      const at = piece.color === 'w' ? r * 8 + f : (7 - r) * 8 + f;
      const value = KING_MID[at] * (1 - endgameWeight) + KING_END[at] * endgameWeight;
      score += piece.color === 'w' ? value : -value;
    }
  }

  return game.turn() === 'w' ? score : -score;
}

/** Most Valuable Victim / Least Valuable Aggressor, for capture ordering. */
export function mvvLva(move) {
  if (!move.captured) return 0;
  return PIECE_VALUE[move.captured] * 10 - PIECE_VALUE[move.piece];
}
