/** Play against the engine. */

import { Board } from '../board.js';
import { BoardInput } from '../input.js';
import { newGame, applyUci, isPromotion, legalTargets, status } from '../../core/rules.js';
import { bestMove, preload, terminate } from '../../ai/engine.js';
import { playMoveSound, sfx, haptic } from '../sound.js';
import { announce, toast, confetti } from '../fx.js';
import { getProfile, updatePrefs } from '../../core/store.js';
import { icon } from '../icons.js';
import { escapeHtml } from './puzzle.js';

const LEVEL_NAMES = { 1: 'Gentle', 2: 'Casual', 3: 'Steady', 4: 'Sharp', 5: 'Brutal' };

export function renderPlay(root, { navigate }) {
  const prefs = getProfile().prefs;
  let level = prefs.aiLevel || 3;
  let playerColour = 'w';
  let game = newGame();
  let thinking = false;
  let over = false;

  root.innerHTML = `
    <div class="screen">
      <div class="puzzle-head">
        <button class="btn btn-icon" data-nav="home" aria-label="Back">${icon('back')}</button>
        <div>
          <div class="card-title">Play the computer</div>
          <div class="card-sub" data-el="level-label"></div>
        </div>
        <span class="spacer"></span>
        <button class="btn btn-icon" data-act="flip" aria-label="Flip board">${icon('flip')}</button>
      </div>

      <div class="chip-wrap" data-el="levels" role="group" aria-label="Engine strength"></div>

      <div class="board-wrap"><div data-el="board"></div></div>

      <div class="status-bar" data-el="status">
        <span class="status-icon" data-el="status-icon"></span>
        <span class="status-text" data-el="status-text">Your move.</span>
      </div>

      <div class="btn-row">
        <button class="btn" data-act="undo">${icon('undo')}Undo</button>
        <button class="btn" data-act="swap">${icon('repeat')}Switch sides</button>
        <button class="btn btn-primary" data-act="new">New game</button>
      </div>
    </div>
  `;

  const el = (n) => root.querySelector(`[data-el="${n}"]`);
  const board = new Board(el('board'), {
    orientation: playerColour,
    coordinates: prefs.coordinates !== false,
  });

  const input = new BoardInput(board, {
    canPickUp: (square) => {
      if (thinking || over) return false;
      const piece = game.get(square);
      return !!piece && piece.color === game.turn() && game.turn() === playerColour;
    },
    getTargets: (square) => legalTargets(game, square),
    onMove: (from, to) => onPlayerMove(from, to),
    onSelectionChange: (selected, targets) => {
      board.highlight({ selected, targets, lastMove: lastMove() });
      input.refreshTabStop();
    },
  });

  preload();

  // -- helpers -------------------------------------------------------------

  function lastMove() {
    const history = game.history({ verbose: true });
    const last = history[history.length - 1];
    return last ? [last.from, last.to] : null;
  }

  function setStatus(text, tone = '') {
    el('status').className = `status-bar${tone ? ` is-${tone}` : ''}`;
    el('status-text').textContent = text;
    const name = tone === 'good' ? 'check' : tone === 'bad' ? 'x' : tone === 'warn' ? 'clock' : '';
    el('status-icon').innerHTML = name ? icon(name) : '';
  }

  function renderLevels() {
    el('levels').innerHTML = Object.entries(LEVEL_NAMES).map(([value, name]) => `
      <button class="chip chip-btn" data-level="${value}" aria-pressed="${Number(value) === level}">
        ${escapeHtml(name)}
      </button>
    `).join('');
    el('level-label').textContent = `${LEVEL_NAMES[level]} · you play ${playerColour === 'w' ? 'White' : 'Black'}`;
  }

  function refresh() {
    board.setPosition(game.fen());
    board.highlight({ lastMove: lastMove() });
    input.refreshTabStop();
  }

  function describeEnd() {
    const st = status(game);
    if (st.isCheckmate) {
      const winner = game.turn() === 'w' ? 'Black' : 'White';
      const youWon = (game.turn() === 'w' ? 'b' : 'w') === playerColour;
      return { text: `Checkmate — ${winner} wins.`, tone: youWon ? 'good' : 'bad', youWon };
    }
    if (st.isStalemate) return { text: 'Stalemate — draw.', tone: 'warn', youWon: false };
    if (st.isDraw) return { text: 'Draw.', tone: 'warn', youWon: false };
    return null;
  }

  function checkEnd() {
    const end = describeEnd();
    if (!end) return false;
    over = true;
    setStatus(end.text, end.tone);
    announce(end.text);
    if (end.youWon) confetti(el('board'));
    input.setEnabled(false);
    return true;
  }

  // -- move flow -----------------------------------------------------------

  async function onPlayerMove(from, to) {
    let promotion;
    if (isPromotion(game, from, to)) {
      promotion = await askPromotion(el('board'), game.turn());
      if (!promotion) { board.resetPiece(from); refresh(); return; }
    }
    const move = applyUci(game, from + to + (promotion || ''));
    if (!move) { board.resetPiece(from); refresh(); return; }

    await board.applyMove(move, game.fen());
    const st = status(game);
    playMoveSound(move, { check: st.inCheck && !st.isCheckmate, mate: st.isCheckmate });
    haptic(10);
    board.highlight({ lastMove: [move.from, move.to] });

    if (checkEnd()) return;
    engineTurn();
  }

  async function engineTurn() {
    if (over || game.turn() === playerColour) return;
    thinking = true;
    input.setEnabled(false);
    setStatus('Thinking…', 'warn');

    try {
      const result = await bestMove(game.fen(), { level });
      if (result.cancelled || !result.uci) { thinking = false; input.setEnabled(true); return; }

      const move = applyUci(game, result.uci);
      if (move) {
        await board.applyMove(move, game.fen());
        const st = status(game);
        playMoveSound(move, { check: st.inCheck && !st.isCheckmate, mate: st.isCheckmate });
        board.highlight({ lastMove: [move.from, move.to] });
        announce(`Computer plays ${move.san}.`);
      }
    } catch {
      toast('The engine stumbled — your move.');
    }

    thinking = false;
    if (checkEnd()) return;
    input.setEnabled(true);
    input.refreshTabStop();
    const st = status(game);
    setStatus(st.inCheck ? 'Check — your move.' : 'Your move.', st.inCheck ? 'warn' : '');
  }

  function newRound() {
    game = newGame();
    over = false;
    thinking = false;
    board.setOrientation(playerColour);
    refresh();
    input.setEnabled(true);
    setStatus('Your move.');
    if (playerColour === 'b') engineTurn();
  }

  function undo() {
    if (thinking) return;
    // Take back the pair, so it is the player's move again.
    game.undo();
    if (game.turn() !== playerColour) game.undo();
    over = false;
    refresh();
    input.setEnabled(true);
    setStatus('Your move.');
  }

  // -- events --------------------------------------------------------------

  root.addEventListener('click', (event) => {
    const nav = event.target.closest('[data-nav]');
    if (nav) { terminate(); navigate(nav.dataset.nav); return; }

    const lvl = event.target.closest('[data-level]');
    if (lvl) {
      level = Number(lvl.dataset.level);
      updatePrefs({ aiLevel: level });
      renderLevels();
      toast(`Strength: ${LEVEL_NAMES[level]}`);
      return;
    }

    const action = event.target.closest('[data-act]')?.dataset.act;
    if (action === 'flip') { board.flip(); board.highlight({ lastMove: lastMove() }); }
    else if (action === 'new') newRound();
    else if (action === 'undo') undo();
    else if (action === 'swap') {
      playerColour = playerColour === 'w' ? 'b' : 'w';
      renderLevels();
      newRound();
    }
  });

  renderLevels();
  refresh();
  setStatus('Your move.');
}

/** Shared with the puzzle screen in spirit; kept local to avoid a circular import. */
function askPromotion(boardHost, colour) {
  return new Promise((resolve) => {
    const host = document.createElement('div');
    host.className = 'promo';
    host.innerHTML = `
      <div class="promo-row" role="dialog" aria-modal="true" aria-label="Choose promotion piece">
        ${['q', 'r', 'b', 'n'].map((p) => `
          <button class="promo-btn" data-piece="${p}"
                  aria-label="${{ q: 'Queen', r: 'Rook', b: 'Bishop', n: 'Knight' }[p]}">
            <svg viewBox="0 0 45 45" aria-hidden="true"><use href="#${colour}${p}"></use></svg>
          </button>`).join('')}
      </div>`;
    boardHost.appendChild(host);
    host.querySelector('.promo-btn')?.focus();

    const finish = (v) => { host.remove(); document.removeEventListener('keydown', onKey); resolve(v); };
    const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); finish(null); } };
    document.addEventListener('keydown', onKey);
    host.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-piece]');
      if (btn) finish(btn.dataset.piece);
      else if (e.target === host) finish(null);
    });
  });
}
