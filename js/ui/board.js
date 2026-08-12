/**
 * Board renderer.
 *
 * Two stacked layers inside one square container:
 *   .bd-squares  a real ARIA grid of 64 cells (rows use display:contents so the
 *                semantics are correct without disturbing the CSS grid layout)
 *   .bd-pieces   absolutely positioned pieces, moved with transforms
 *
 * Keeping pieces on their own transform layer is what makes sliding animation
 * cheap: a move is a single transform change on one element, not a re-render.
 */

import { FILES, RANKS, SQUARES, describeSquare, newGame, checkedKingSquare } from '../core/rules.js';
import { pieceElement } from './pieces.js';

const ANIM_MS = 190;

export class Board {
  /**
   * @param {HTMLElement} root
   * @param {{orientation?:'w'|'b', coordinates?:boolean, interactive?:boolean}} opts
   */
  constructor(root, opts = {}) {
    this.root = root;
    this.orientation = opts.orientation || 'w';
    this.coordinates = opts.coordinates !== false;
    this.interactive = opts.interactive !== false;

    this.fen = null;
    this.pieces = new Map(); // square -> { el, type, color }
    this.focus = null;
    this.animating = false;

    this._build();
  }

  // -- construction --------------------------------------------------------

  _build() {
    this.root.classList.add('bd');
    this.root.innerHTML = '';

    this.squaresLayer = document.createElement('div');
    this.squaresLayer.className = 'bd-squares';
    this.squaresLayer.setAttribute('role', 'grid');
    this.squaresLayer.setAttribute('aria-label', 'Chess board');

    this.cells = new Map();
    for (let r = 0; r < 8; r++) {
      const row = document.createElement('div');
      row.className = 'bd-row';
      row.setAttribute('role', 'row');
      for (let f = 0; f < 8; f++) {
        const cell = document.createElement('div');
        cell.className = 'bd-sq';
        cell.setAttribute('role', 'gridcell');
        cell.tabIndex = -1;
        row.appendChild(cell);
      }
      this.squaresLayer.appendChild(row);
    }

    this.piecesLayer = document.createElement('div');
    this.piecesLayer.className = 'bd-pieces';
    this.piecesLayer.setAttribute('aria-hidden', 'true');

    this.overlay = document.createElement('div');
    this.overlay.className = 'bd-overlay';
    this.overlay.setAttribute('aria-hidden', 'true');

    this.root.append(this.squaresLayer, this.piecesLayer, this.overlay);
    this._layoutCells();
  }

  /** Assigns squares to cells for the current orientation. */
  _layoutCells() {
    const order = this._visualOrder();
    const cells = this.squaresLayer.querySelectorAll('.bd-sq');
    this.cells.clear();
    order.forEach((square, i) => {
      const cell = cells[i];
      const f = FILES.indexOf(square[0]);
      const r = RANKS.indexOf(square[1]);
      cell.dataset.square = square;
      cell.classList.toggle('is-dark', (f + r) % 2 === 0);
      cell.innerHTML = '';
      if (this.coordinates) {
        const col = i % 8;
        const row = Math.floor(i / 8);
        if (row === 7) {
          const s = document.createElement('span');
          s.className = 'bd-coord bd-coord-file';
          s.textContent = square[0];
          cell.appendChild(s);
        }
        if (col === 0) {
          const s = document.createElement('span');
          s.className = 'bd-coord bd-coord-rank';
          s.textContent = square[1];
          cell.appendChild(s);
        }
      }
      this.cells.set(square, cell);
    });
  }

  /** Squares in reading order for the current orientation. */
  _visualOrder() {
    return this.orientation === 'w' ? SQUARES : [...SQUARES].reverse();
  }

  /** Percent offsets for a square under the current orientation. */
  _coords(square) {
    const f = FILES.indexOf(square[0]);
    const r = RANKS.indexOf(square[1]);
    const col = this.orientation === 'w' ? f : 7 - f;
    const row = this.orientation === 'w' ? 7 - r : r;
    return { x: col * 100, y: row * 100 };
  }

  // -- position ------------------------------------------------------------

  /** Replaces the position outright, no animation. */
  setPosition(fen) {
    this.fen = fen;
    this.piecesLayer.innerHTML = '';
    this.pieces.clear();
    const game = newGame(fen);
    for (const square of SQUARES) {
      const piece = game.get(square);
      if (piece) this._addPiece(square, piece);
    }
    this._syncLabels(game);
  }

  _addPiece(square, piece) {
    const el = document.createElement('div');
    el.className = 'bd-piece';
    el.appendChild(pieceElement(piece));
    const { x, y } = this._coords(square);
    el.style.transform = `translate(${x}%, ${y}%)`;
    this.piecesLayer.appendChild(el);
    this.pieces.set(square, { el, type: piece.type, color: piece.color });
    return el;
  }

  /**
   * Animates a chess.js move object, then settles on `fen`.
   * Handles captures, en passant, castling and promotion.
   */
  async applyMove(move, fen) {
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      this.setPosition(fen);
      return;
    }

    const moving = this.pieces.get(move.from);
    if (!moving) {
      this.setPosition(fen);
      return;
    }

    // Captured piece: usually on `to`, but en passant takes from another square.
    let capturedSquare = null;
    if (move.flags.includes('e')) {
      capturedSquare = move.to[0] + move.from[1];
    } else if (move.captured) {
      capturedSquare = move.to;
    }
    if (capturedSquare) {
      const victim = this.pieces.get(capturedSquare);
      if (victim) {
        victim.el.classList.add('is-captured');
        setTimeout(() => victim.el.remove(), ANIM_MS);
        this.pieces.delete(capturedSquare);
      }
    }

    // Slide the moving piece.
    this.pieces.delete(move.from);
    const { x, y } = this._coords(move.to);
    moving.el.style.transform = `translate(${x}%, ${y}%)`;
    this.pieces.set(move.to, moving);

    // Castling moves the rook too.
    if (move.flags.includes('k') || move.flags.includes('q')) {
      const rank = move.from[1];
      const kingside = move.flags.includes('k');
      const rookFrom = (kingside ? 'h' : 'a') + rank;
      const rookTo = (kingside ? 'f' : 'd') + rank;
      const rook = this.pieces.get(rookFrom);
      if (rook) {
        this.pieces.delete(rookFrom);
        const rc = this._coords(rookTo);
        rook.el.style.transform = `translate(${rc.x}%, ${rc.y}%)`;
        this.pieces.set(rookTo, rook);
      }
    }

    this.animating = true;
    await new Promise((r) => setTimeout(r, ANIM_MS));
    this.animating = false;

    // Promotion swaps the glyph once the piece has arrived.
    this.setPosition(fen);
  }

  _syncLabels(game) {
    for (const [square, cell] of this.cells) {
      const piece = game.get(square);
      cell.setAttribute('aria-label', describeSquare(square, piece));
    }
  }

  // -- highlighting --------------------------------------------------------

  /**
   * @param {{selected?:string, targets?:string[], lastMove?:[string,string],
   *          check?:string, hint?:string, hintTarget?:string, wrong?:string}} state
   */
  highlight(state = {}) {
    const game = this.fen ? newGame(this.fen) : null;
    const check = state.check !== undefined ? state.check : (game ? checkedKingSquare(game) : null);

    for (const [square, cell] of this.cells) {
      cell.classList.toggle('is-selected', state.selected === square);
      cell.classList.toggle('is-last', !!state.lastMove?.includes(square));
      cell.classList.toggle('is-check', check === square);
      cell.classList.toggle('is-hint', state.hint === square);
      cell.classList.toggle('is-hint-target', state.hintTarget === square);
      cell.classList.toggle('is-wrong', state.wrong === square);

      const isTarget = state.targets?.includes(square);
      cell.classList.toggle('is-target', !!isTarget);
      // Occupied targets get a ring, empty ones a dot — shape carries the
      // meaning so the cue survives colour-blindness.
      cell.classList.toggle('is-target-capture', !!isTarget && this.pieces.has(square));
    }
  }

  clearHighlights() {
    this.highlight({});
  }

  /**
   * Dims squares away from the action. Pass a Set of live squares, or null to
   * clear. Dimmed squares are empty by construction, so the pieces layer needs
   * no treatment — and the board stays fully playable either way, since this is
   * only a tint. Cropping would change the position's meaning; dimming cannot.
   */
  setFocus(live) {
    this.focus = live;
    this.root.classList.toggle('has-focus', !!live);
    for (const [square, cell] of this.cells) {
      cell.classList.toggle('is-dim', !!live && !live.has(square));
    }
  }

  setOrientation(colour) {
    if (this.orientation === colour) return;
    this.orientation = colour;
    this._layoutCells();
    if (this.fen) this.setPosition(this.fen);
    if (this.focus) this.setFocus(this.focus);
  }

  flip() {
    this.setOrientation(this.orientation === 'w' ? 'b' : 'w');
  }

  // -- effects -------------------------------------------------------------

  shake() {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    this.root.classList.remove('is-shaking');
    void this.root.offsetWidth; // restart the animation
    this.root.classList.add('is-shaking');
    setTimeout(() => this.root.classList.remove('is-shaking'), 400);
  }

  /** Lifts a piece visually while it is being dragged. */
  lift(square, on) {
    const p = this.pieces.get(square);
    if (p) p.el.classList.toggle('is-lifted', on);
  }

  /** Moves a dragged piece to an absolute board-relative position, in percent. */
  dragTo(square, xPct, yPct) {
    const p = this.pieces.get(square);
    if (p) p.el.style.transform = `translate(${xPct}%, ${yPct}%)`;
  }

  /** Snaps a dragged piece back to its home square. */
  resetPiece(square) {
    const p = this.pieces.get(square);
    if (!p) return;
    const { x, y } = this._coords(square);
    p.el.style.transform = `translate(${x}%, ${y}%)`;
  }

  squareAt(clientX, clientY) {
    const rect = this.root.getBoundingClientRect();
    const col = Math.floor(((clientX - rect.left) / rect.width) * 8);
    const row = Math.floor(((clientY - rect.top) / rect.height) * 8);
    if (col < 0 || col > 7 || row < 0 || row > 7) return null;
    return this._visualOrder()[row * 8 + col];
  }

  cellFor(square) {
    return this.cells.get(square) || null;
  }
}
