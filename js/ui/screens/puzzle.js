/**
 * The puzzle player.
 *
 * One screen serves every mode — daily, practice, theme drill, review — because
 * the loop is identical; only the queue and the post-solve bookkeeping differ.
 * Modes pass in a queue and a couple of callbacks.
 */

import { Board } from '../board.js';
import { BoardInput } from '../input.js';
import { PuzzleSession, State, HINT } from '../../core/puzzle.js';
import { explain, themeName } from '../../core/explain.js';
import { status, newGame } from '../../core/rules.js';
import { pieceHref } from '../pieces.js';
import { playMoveSound, sfx, haptic } from '../sound.js';
import { announce, confetti } from '../fx.js';
import { getProfile, recordSolve, pushHistory } from '../../core/store.js';
import { icon } from '../icons.js';
import * as srs from '../../core/srs.js';

const INTRO_DELAY = 520;
const REPLY_DELAY = 260;

/**
 * @param {HTMLElement} root
 * @param {{title:string, subtitle:string, queue:{next:()=>object|null},
 *          onExit:()=>void, onSolved?:(session)=>void,
 *          showNext?:boolean, emptyMessage?:string}} opts
 */
export function renderPuzzleScreen(root, opts) {
  const prefs = getProfile().prefs;

  root.innerHTML = `
    <div class="screen">
      <div class="puzzle-head">
        <button class="btn btn-icon" data-act="back" aria-label="Back">${icon('back')}</button>
        <div>
          <div class="card-title" data-el="title">${escapeHtml(opts.title)}</div>
          <div class="card-sub" data-el="subtitle">${escapeHtml(opts.subtitle || '')}</div>
        </div>
        <span class="spacer"></span>
        <span class="chip" data-el="rating" hidden></span>
      </div>

      <div class="board-wrap">
        <div data-el="board"></div>
      </div>

      <div class="status-bar" data-el="status">
        <span class="status-icon" data-el="status-icon"></span>
        <span class="status-text" data-el="status-text">Loading…</span>
      </div>

      <div class="btn-row">
        <button class="btn" data-act="hint">${icon('bulb')}<span data-el="hint-label">Hint</span></button>
        <button class="btn" data-act="retry">${icon('undo')}Retry</button>
        <button class="btn btn-icon" data-act="flip" aria-label="Flip board">${icon('flip')}</button>
        <button class="btn btn-primary" data-act="next" hidden>${icon('next')}Next</button>
      </div>

      <div data-el="explain"></div>
    </div>
  `;

  const el = (name) => root.querySelector(`[data-el="${name}"]`);
  const act = (name) => root.querySelector(`[data-act="${name}"]`);

  const boardHost = el('board');
  const board = new Board(boardHost, {
    orientation: 'w',
    coordinates: prefs.coordinates !== false,
  });

  let session = null;
  let busy = false;
  let solvedRecorded = false;

  const input = new BoardInput(board, {
    canPickUp: (square) => {
      if (!session || busy || session.state !== State.AWAITING) return false;
      const game = newGame(session.position);
      const piece = game.get(square);
      return !!piece && piece.color === session.sideToMove;
    },
    getTargets: (square) => (session ? session.targetsFor(square) : []),
    onMove: (from, to) => handleMove(from, to),
    onSelectionChange: (selected, targets) => {
      board.highlight({
        selected,
        targets,
        lastMove: session?.lastMove,
      });
      input.refreshTabStop();
    },
  });

  // -- rendering helpers ---------------------------------------------------

  function setStatus(text, tone = '') {
    const bar = el('status');
    bar.className = `status-bar${tone ? ` is-${tone}` : ''}`;
    el('status-text').textContent = text;
    const iconName = tone === 'good' ? 'check' : tone === 'bad' ? 'x' : tone === 'warn' ? 'bulb' : '';
    el('status-icon').innerHTML = iconName ? icon(iconName) : '';
  }

  function turnLine() {
    if (!session) return '';
    const colour = session.sideToMove === 'w' ? 'White' : 'Black';
    const mate = session.mateIn;
    return mate ? `${colour} to play — mate in ${mate}` : `${colour} to play — find the best move`;
  }

  function refreshHighlights(extra = {}) {
    board.highlight({
      selected: input.selected,
      targets: input.targets,
      lastMove: session?.lastMove,
      ...extra,
    });
  }

  // -- puzzle lifecycle ----------------------------------------------------

  async function loadNext() {
    const puzzle = opts.queue.next();
    if (!puzzle) {
      renderExhausted();
      return;
    }
    solvedRecorded = false;
    session = new PuzzleSession(puzzle);

    el('rating').hidden = false;
    el('rating').textContent = String(puzzle.rating);
    el('explain').innerHTML = '';
    act('next').hidden = true;
    act('hint').disabled = false;
    el('hint-label').textContent = 'Hint';

    board.setOrientation(session.playerColor);
    board.setPosition(puzzle.fen);
    board.setFocus(prefs.focusMode !== false ? session.focus() : null);
    board.clearHighlights();

    setStatus('Watch the opponent’s move…');
    busy = true;
    input.setEnabled(false);

    await wait(INTRO_DELAY);

    const intro = session.start();
    if (intro.move) {
      await board.applyMove(intro.move, intro.fen);
      const st = status(newGame(intro.fen));
      playMoveSound(intro.move, { check: st.inCheck });
    } else {
      board.setPosition(session.position);
    }

    busy = false;
    input.setEnabled(true);
    input.cursor = session.lastMove ? session.lastMove[1] : 'e4';
    input.refreshTabStop();
    refreshHighlights();
    setStatus(turnLine());
    announce(turnLine());
  }

  /**
   * @param {string} from
   * @param {string} to
   * @param {string} [promotion] pre-chosen promotion piece; when supplied the
   *   picker is skipped. Hint level 3 passes it so that "play it for me" really
   *   plays the recorded move — including an underpromotion, which the picker
   *   would otherwise have to be answered for and could still get wrong.
   */
  async function handleMove(from, to, promotion) {
    if (!session || busy) return;

    let uci = from + to;
    if (promotion) {
      uci += promotion;
    } else if (session.needsPromotion(from, to)) {
      const piece = await askPromotion(boardHost, session.sideToMove);
      if (!piece) { board.resetPiece(from); refreshHighlights(); return; }
      uci += piece;
    }

    busy = true;
    input.setEnabled(false);
    const result = session.tryMove(uci);

    if (result.result === 'wrong') {
      await onWrong(result);
      busy = false;
      input.setEnabled(true);
      return;
    }

    // Animate the player's move.
    await board.applyMove(result.move, result.fen);
    const afterPlayer = status(newGame(result.fen));
    playMoveSound(result.move, {
      check: afterPlayer.inCheck && !afterPlayer.isCheckmate,
      mate: afterPlayer.isCheckmate,
    });
    haptic(10);

    if (result.reply) {
      await wait(REPLY_DELAY);
      await board.applyMove(result.reply.move, result.reply.fen);
      const afterReply = status(newGame(result.reply.fen));
      playMoveSound(result.reply.move, { check: afterReply.inCheck });
    }

    board.setPosition(session.position);
    refreshHighlights();

    if (result.result === 'solved') {
      await onSolved();
    } else {
      setStatus('Correct — keep going.', 'good');
      announce('Correct. ' + turnLine());
      // The hint ladder restarts for the next move of the line, so the button
      // has to come back — a mate in 2 needs it twice.
      act('hint').disabled = false;
      el('hint-label').textContent = 'Hint';
      busy = false;
      input.setEnabled(true);
      input.refreshTabStop();
    }
  }

  async function onWrong(result) {
    sfx.wrong();
    haptic(28);
    board.shake();

    // Show the attempted move landing, then take it back.
    if (result.wrongFen && result.move) {
      board.setPosition(result.wrongFen);
      refreshHighlights({ wrong: result.move.to, lastMove: [result.move.from, result.move.to] });
      await wait(420);
    }
    board.setPosition(session.position);
    session.recover();
    refreshHighlights();

    const tries = session.attempts;
    setStatus(
      tries === 1 ? 'Not quite — try again.' : `Not quite (${tries} tries). Take another look.`,
      'bad'
    );
    announce('Incorrect. Try again.');
    input.refreshTabStop();
  }

  async function onSolved() {
    sfx.solved();
    haptic(20);
    confetti(boardHost);

    const clean = session.isClean;
    setStatus(
      clean ? 'Solved — first try.' : 'Solved.',
      'good'
    );
    announce(clean ? 'Solved on the first try.' : 'Solved.');

    // Render the explainer BEFORE the mode callback: modes such as the daily
    // append their own controls (the share button) into it.
    renderExplain();

    if (!solvedRecorded) {
      solvedRecorded = true;
      recordSolve({ clean, hints: session.hintsUsed, attempts: session.attempts });
      srs.record(session.puzzle.id, { solvedCleanly: clean });
      pushHistory({
        id: session.puzzle.id,
        date: new Date().toISOString().slice(0, 10),
        result: 'solved',
        attempts: session.attempts,
        hints: session.hintsUsed,
        rating: session.puzzle.rating,
      });
      opts.onSolved?.(session);
    }

    act('hint').disabled = true;
    el('hint-label').textContent = 'Hint'; // clear any mid-ladder label
    act('next').hidden = opts.showNext === false;
    act('next').focus({ preventScroll: true });
    input.setEnabled(false);
    busy = false;
  }

  function renderExplain() {
    const info = explain(session.puzzle.themes);
    const tags = info.tags
      .filter((t) => t !== 'mate')
      .slice(0, 4)
      .map((t) => `<span class="chip">${escapeHtml(themeName(t))}</span>`)
      .join('');

    el('explain').innerHTML = `
      <div class="explain">
        <div class="explain-head">${icon('sparkle')}${escapeHtml(info.title)}</div>
        <div class="explain-body">${escapeHtml(info.body)}</div>
        ${tags ? `<div class="chip-wrap explain-more">${tags}</div>` : ''}
      </div>
    `;
  }

  function renderExhausted() {
    root.innerHTML = `
      <div class="screen">
        <div class="puzzle-head">
          <button class="btn btn-icon" data-act="back" aria-label="Back">${icon('back')}</button>
          <div class="card-title">${escapeHtml(opts.title)}</div>
        </div>
        <div class="card empty">
          <div class="empty-icon">${icon('check')}</div>
          <div class="empty-title">All clear</div>
          <div class="empty-sub">${escapeHtml(opts.emptyMessage || 'Nothing left here right now.')}</div>
        </div>
        <button class="btn btn-primary" data-act="back2">Back to menu</button>
      </div>
    `;
    root.querySelector('[data-act="back"]')?.addEventListener('click', opts.onExit);
    root.querySelector('[data-act="back2"]')?.addEventListener('click', opts.onExit);
  }

  // -- controls ------------------------------------------------------------

  function onHint() {
    if (!session || busy || session.state !== State.AWAITING) return;
    const hint = session.hint();
    if (!hint) return;
    sfx.hint();

    if (hint.level === HINT.PIECE) {
      refreshHighlights({ hint: hint.from });
      setStatus('This piece has the move.', 'warn');
      announce(`Hint: the piece on ${hint.from} moves.`);
      el('hint-label').textContent = 'Where?';
    } else if (hint.level === HINT.TARGET) {
      refreshHighlights({ hint: hint.from, hintTarget: hint.to });
      setStatus(`Move it to ${hint.to}.`, 'warn');
      announce(`Hint: move ${hint.from} to ${hint.to}.`);
      el('hint-label').textContent = 'Play it';
    } else {
      setStatus('Playing the move for you.', 'warn');
      announce(`The move is ${hint.from} to ${hint.to}.`);
      // Pass the promotion piece through so underpromotion hints work.
      // handleMove re-enables the button if more of the line remains.
      handleMove(hint.uci.slice(0, 2), hint.uci.slice(2, 4), hint.uci[4]);
    }
  }

  function onRetry() {
    if (!session) return;
    // A retry replays the position but must not launder the record: the
    // attempts and hints already spent still count against a clean solve.
    const keepAttempts = session.attempts;
    const keepHints = session.hintsUsed;
    session.reset();
    session.attempts = keepAttempts;
    session.hintsUsed = keepHints;
    solvedRecorded = false;
    el('explain').innerHTML = '';
    act('next').hidden = true;
    act('hint').disabled = false;
    el('hint-label').textContent = 'Hint';
    board.setPosition(session.puzzle.fen);
    board.clearHighlights();
    (async () => {
      busy = true;
      input.setEnabled(false);
      await wait(260);
      const intro = session.start();
      if (intro.move) await board.applyMove(intro.move, intro.fen);
      board.setPosition(session.position);
      busy = false;
      input.setEnabled(true);
      refreshHighlights();
      setStatus(turnLine());
    })();
  }

  root.addEventListener('click', (event) => {
    const button = event.target.closest('[data-act]');
    if (!button) return;
    switch (button.dataset.act) {
      case 'back': opts.onExit(); break;
      case 'hint': onHint(); break;
      case 'retry': onRetry(); break;
      case 'flip': board.flip(); refreshHighlights(); break;
      case 'next': loadNext(); break;
    }
  });

  loadNext();

  return {
    destroy() { /* listeners live on root, which the router replaces */ },
  };
}

// -- promotion ---------------------------------------------------------------

/** Modal promotion picker. Resolves to 'q'|'r'|'b'|'n', or null if cancelled. */
function askPromotion(boardHost, colour) {
  return new Promise((resolve) => {
    const host = document.createElement('div');
    host.className = 'promo';
    host.innerHTML = `
      <div class="promo-row" role="dialog" aria-modal="true" aria-label="Choose promotion piece">
        ${['q', 'r', 'b', 'n'].map((p, i) => `
          <button class="promo-btn" data-piece="${p}" ${i === 0 ? 'autofocus' : ''}
                  aria-label="${{ q: 'Queen', r: 'Rook', b: 'Bishop', n: 'Knight' }[p]}">
            <svg viewBox="0 0 45 45" aria-hidden="true"><use href="${pieceHref(colour, p)}"></use></svg>
          </button>`).join('')}
      </div>
    `;
    boardHost.appendChild(host);
    host.querySelector('.promo-btn')?.focus();

    const finish = (value) => {
      host.remove();
      document.removeEventListener('keydown', onKey);
      resolve(value);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); finish(null); }
    };
    document.addEventListener('keydown', onKey);
    host.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-piece]');
      if (btn) finish(btn.dataset.piece);
      else if (e.target === host) finish(null);
    });
  });
}

// -- utils -------------------------------------------------------------------

function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}
