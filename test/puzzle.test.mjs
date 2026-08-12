/** Puzzle session state machine. */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { PuzzleSession, State, HINT, puzzleFromRow } from '../js/core/puzzle.js';

/**
 * Mate in 1. Position before Black's setup move; Black plays ...Kh8??, then
 * White mates with Ra8#. Line: [black setup, white mate].
 */
const mateIn1 = {
  id: 'M1',
  fen: '6k1/5ppp/8/8/8/8/5PPP/R5K1 b - - 0 1',
  moves: ['g8h8', 'a1a8'],
  rating: 800,
  themes: ['mateIn1', 'backRankMate'],
};

/**
 * A position with TWO different mates: after ...Kh8, both Ra8# (the recorded
 * move) and Qb8# mate. Used to prove alternative mates are accepted.
 */
const twoMates = {
  id: 'M2',
  fen: '6k1/5ppp/8/8/8/1Q6/5PPP/R5K1 b - - 0 1',
  moves: ['g8h8', 'a1a8'],
  rating: 1000,
  themes: ['mateIn1', 'backRankMate'],
};

describe('PuzzleSession', () => {
  test('starts by playing the opponent setup move', () => {
    const s = new PuzzleSession(mateIn1);
    assert.equal(s.state, State.INTRO);
    const { move } = s.start();
    assert.equal(move.from, 'g8');
    assert.equal(move.to, 'h8');
    assert.equal(s.state, State.AWAITING);
    assert.equal(s.sideToMove, 'w', 'player should be to move after the setup');
  });

  test('playerColor is the side to move after the setup move', () => {
    assert.equal(new PuzzleSession(mateIn1).playerColor, 'w');
  });

  test('the recorded solution solves it', () => {
    const s = new PuzzleSession(mateIn1);
    s.start();
    const result = s.tryMove('a1a8');
    assert.equal(result.result, 'solved');
    assert.equal(s.state, State.SOLVED);
    assert.ok(s.isClean);
  });

  test('a wrong move is rejected, reverts, and costs nothing but an attempt', () => {
    const s = new PuzzleSession(mateIn1);
    s.start();
    const before = s.position;

    const result = s.tryMove('g2g3');
    assert.equal(result.result, 'wrong');
    assert.equal(s.attempts, 1);
    assert.equal(s.position, before, 'the position must be restored');
    assert.equal(s.state, State.WRONG);
    assert.ok(!s.isClean);

    // No penalty: recovering allows another try, and the right move still works.
    s.recover();
    assert.equal(s.state, State.AWAITING);
    assert.equal(s.tryMove('a1a8').result, 'solved');
  });

  test('an illegal move is rejected without changing the position', () => {
    const s = new PuzzleSession(mateIn1);
    s.start();
    const before = s.position;
    const result = s.tryMove('a1a9');
    assert.equal(result.result, 'wrong');
    assert.equal(s.position, before);
  });

  test('any mate is accepted, even when it is not the recorded move', () => {
    const recorded = new PuzzleSession(twoMates);
    recorded.start();
    assert.equal(recorded.tryMove('a1a8').result, 'solved', 'the book move must work');

    // Qb8# is just as forced. Rejecting it would feel broken to a player who
    // has genuinely solved the position, so the session accepts it.
    const alternative = new PuzzleSession(twoMates);
    alternative.start();
    assert.equal(alternative.tryMove('b3b8').result, 'solved');
    assert.ok(alternative.isClean, 'finding a different mate is still a clean solve');
  });

  test('a non-mating move that is not the recorded move is still rejected', () => {
    const s = new PuzzleSession(twoMates);
    s.start();
    assert.equal(s.tryMove('b3b7').result, 'wrong', 'Qb7 is strong but not mate');
    assert.equal(s.attempts, 1);
  });

  test('the hint ladder walks piece -> target -> move', () => {
    const s = new PuzzleSession(mateIn1);
    s.start();

    const h1 = s.hint();
    assert.equal(h1.level, HINT.PIECE);
    assert.equal(h1.from, 'a1');
    assert.equal(h1.to, null, 'level 1 must not give away the destination');

    const h2 = s.hint();
    assert.equal(h2.level, HINT.TARGET);
    assert.equal(h2.to, 'a8');
    assert.equal(h2.uci, null);

    const h3 = s.hint();
    assert.equal(h3.level, HINT.MOVE);
    assert.equal(h3.uci, 'a1a8');

    assert.equal(s.hintsUsed, 3);
    assert.ok(!s.isClean, 'hints disqualify a clean solve');
  });

  test('the hint ladder restarts on each move of a longer line', () => {
    const line = {
      id: 'L', rating: 900, themes: [],
      fen: '6k1/5ppp/8/8/8/8/5PPP/R5K1 b - - 0 1',
      moves: ['g8h8', 'a1a4', 'h8g8', 'a4a8'],
    };
    const s = new PuzzleSession(line);
    s.start();
    s.hint();
    s.hint();
    assert.equal(s.hintLevel, 2);

    s.tryMove('a1a4');
    assert.equal(s.hintLevel, 0, 'the ladder must reset for the next move');
    assert.equal(s.hintsUsed, 2, 'but the cumulative count is kept for grading');
  });

  test('mateIn reads the theme tag', () => {
    assert.equal(new PuzzleSession(mateIn1).mateIn, 1);
    assert.equal(new PuzzleSession({ ...mateIn1, themes: ['fork'] }).mateIn, null);
  });

  test('reset returns the puzzle to its opening state', () => {
    const s = new PuzzleSession(mateIn1);
    s.start();
    s.tryMove('g2g3');
    s.reset();
    assert.equal(s.state, State.INTRO);
    assert.equal(s.attempts, 0);
    assert.equal(s.position, mateIn1.fen);
  });

  test('focus() lights the material and leaves distant empty squares dim', () => {
    const s = new PuzzleSession(mateIn1);
    const live = s.focus();
    assert.ok(live.has('g8'), 'the king square must be lit');
    assert.ok(live.has('a1'), 'the rook square must be lit');
    assert.ok(!live.has('d5'), 'an empty square far from play should not be lit');
    assert.ok(live.size < 64, 'something must actually be dimmed');
  });
});

describe('puzzleFromRow', () => {
  test('expands the compact shard format', () => {
    const p = puzzleFromRow(['abc', '8/8/8/8/8/8/8/K6k w - - 0 1', 'a1a2 h1h2', 1234, [0, 2]],
      ['fork', 'pin', 'mateIn2']);
    assert.equal(p.id, 'abc');
    assert.deepEqual(p.moves, ['a1a2', 'h1h2']);
    assert.equal(p.rating, 1234);
    assert.deepEqual(p.themes, ['fork', 'mateIn2']);
  });
});
