/**
 * Puzzle session state machine.
 *
 *   INTRO      the opponent's setup move plays automatically
 *   AWAITING   player to move
 *   REPLYING   opponent's scripted answer is playing
 *   SOLVED     line complete (or mate delivered early)
 *   WRONG      transient; reverts straight back to AWAITING, no penalty
 *
 * Lichess puzzle lines record ONE defence, so the opponent never needs an
 * engine here — its replies are read from the line.
 */

import { newGame, applyUci, toUci, legalTargets, isPromotion, focusSquares, status } from './rules.js';

export const State = {
  INTRO: 'intro',
  AWAITING: 'awaiting',
  REPLYING: 'replying',
  SOLVED: 'solved',
  WRONG: 'wrong',
};

export const HINT = { PIECE: 1, TARGET: 2, MOVE: 3 };

export class PuzzleSession {
  /**
   * @param {{id:string, fen:string, moves:string[], rating:number, themes:string[]}} puzzle
   */
  constructor(puzzle) {
    this.puzzle = puzzle;
    this.line = Array.isArray(puzzle.moves) ? puzzle.moves : puzzle.moves.split(' ');
    this.reset();
  }

  reset() {
    this.game = newGame(this.puzzle.fen);
    this.ply = 0;
    this.state = State.INTRO;
    this.attempts = 0;
    // The ladder is per-move and resets each time the player advances;
    // hintsUsed is the cumulative count that grading cares about.
    this.hintLevel = 0;
    this.hintsUsed = 0;
    this.lastMove = null;
    this.started = Date.now();
  }

  // -- read-only view ------------------------------------------------------

  get position() { return this.game.fen(); }
  get sideToMove() { return this.game.turn(); }
  /** The colour the player controls — the side to move AFTER the setup move. */
  get playerColor() {
    const g = newGame(this.puzzle.fen);
    applyUci(g, this.line[0]);
    return g.turn();
  }
  get solutionLength() { return Math.ceil((this.line.length - 1) / 2); }
  get movesSolved() { return Math.floor(this.ply / 2); }
  get isSolved() { return this.state === State.SOLVED; }
  /** True when the player has not yet needed a hint or a retry. */
  get isClean() { return this.attempts === 0 && this.hintsUsed === 0; }

  /** Mate-in-N if the puzzle is a mate, else null. */
  get mateIn() {
    const tag = (this.puzzle.themes || []).find((t) => /^mateIn\d$/.test(t));
    return tag ? Number(tag.slice(6)) : null;
  }

  targetsFor(square) {
    return legalTargets(this.game, square);
  }

  needsPromotion(from, to) {
    return isPromotion(this.game, from, to);
  }

  /** Squares focus mode keeps lit. */
  focus() {
    return focusSquares(this.puzzle.fen, this.line);
  }

  // -- transitions ---------------------------------------------------------

  /**
   * Plays the opponent's setup move.
   *
   * The database FEN is the position BEFORE that move: the player is meant to
   * see the threat arrive, not to find it already on the board.
   */
  start() {
    const move = applyUci(this.game, this.line[0]);
    this.ply = 1;
    this.lastMove = move ? [move.from, move.to] : null;
    this.state = State.AWAITING;
    return { move, fen: this.position };
  }

  /**
   * Offers a player move.
   *
   * @returns {{result:'correct'|'solved'|'wrong', move:object|null,
   *            fen:string, wrongFen?:string, reply?:{move:object, fen:string}}}
   */
  tryMove(uci) {
    if (this.state !== State.AWAITING) {
      return { result: 'wrong', move: null, fen: this.position };
    }

    const expected = this.line[this.ply];
    const move = applyUci(this.game, uci);
    if (!move) {
      return { result: 'wrong', move: null, fen: this.position };
    }

    const accepted = this._accepts(uci, expected, move);
    if (!accepted) {
      const wrongFen = this.position;
      this.game.undo();
      this.attempts++;
      this.state = State.WRONG;
      return { result: 'wrong', move, fen: this.position, wrongFen };
    }

    this.ply++;
    this.lastMove = [move.from, move.to];
    this.hintLevel = 0; // the ladder restarts for the next move of the line

    // Delivering mate ends the puzzle immediately, whatever the line said next.
    if (status(this.game).isCheckmate || this.ply >= this.line.length) {
      this.state = State.SOLVED;
      return { result: 'solved', move, fen: this.position };
    }

    // Scripted defence.
    this.state = State.REPLYING;
    const replyMove = applyUci(this.game, this.line[this.ply]);
    this.ply++;
    if (replyMove) this.lastMove = [replyMove.from, replyMove.to];

    if (this.ply >= this.line.length) {
      this.state = State.SOLVED;
      return {
        result: 'solved',
        move,
        fen: this.position,
        reply: replyMove ? { move: replyMove, fen: this.position } : undefined,
      };
    }

    this.state = State.AWAITING;
    return {
      result: 'correct',
      move,
      fen: this.position,
      reply: replyMove ? { move: replyMove, fen: this.position } : undefined,
    };
  }

  /**
   * Is this move good enough?
   *
   * Beyond the recorded move we accept two things, because rejecting them feels
   * broken to a player who has genuinely solved the position:
   *   - any move that delivers checkmate (Lichess behaves the same way)
   *   - a transposition that reaches exactly the position the book move reaches
   *
   * Called with `move` already applied to this.game.
   */
  _accepts(uci, expected, move) {
    if (uci === expected) return true;
    // Promotion defaults to queen when the caller omits it; compare fairly.
    if (move.promotion && uci.length === 4 && uci + move.promotion === expected) return true;
    if (status(this.game).isCheckmate) return true;

    const probe = newGame(this.puzzle.fen);
    for (let i = 0; i < this.ply; i++) applyUci(probe, this.line[i]);
    if (!applyUci(probe, expected)) return false;
    return probe.fen() === this.game.fen();
  }

  /** After a WRONG, put the session back in play. */
  recover() {
    if (this.state === State.WRONG) this.state = State.AWAITING;
  }

  /**
   * Next rung of the hint ladder.
   * 1 = which piece moves, 2 = and where it goes, 3 = play it.
   */
  hint() {
    if (this.state !== State.AWAITING) return null;
    this.hintLevel = Math.min(HINT.MOVE, this.hintLevel + 1);
    this.hintsUsed++;
    const uci = this.line[this.ply];
    return {
      level: this.hintLevel,
      from: uci.slice(0, 2),
      to: this.hintLevel >= HINT.TARGET ? uci.slice(2, 4) : null,
      uci: this.hintLevel >= HINT.MOVE ? uci : null,
    };
  }

  /** The move the player is expected to find — used to auto-play hint level 3. */
  get expectedUci() {
    return this.state === State.AWAITING ? this.line[this.ply] : null;
  }

  /** Full solution in UCI, for the post-solve replay. */
  get solutionUcis() {
    return this.line.slice(1);
  }
}

/** Normalises a shard row [id, fen, moves, rating, themeIdx] into a puzzle. */
export function puzzleFromRow(row, themeTable) {
  const [id, fen, moves, rating, themeIdx] = row;
  const themes = Array.isArray(themeIdx)
    ? themeIdx.map((i) => (typeof i === 'number' ? themeTable[i] : i)).filter(Boolean)
    : [];
  return { id, fen, moves: moves.split(' '), rating, themes };
}

export { toUci };
