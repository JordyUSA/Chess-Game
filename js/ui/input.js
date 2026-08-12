/**
 * Board input: drag, tap-to-move, and keyboard.
 *
 * Tap-to-move is not a fallback — on a phone it is what most people actually
 * use, so both paths are first class and share one selection model. A pointer
 * gesture only becomes a drag after it travels past a threshold, so a sloppy
 * tap still selects rather than dropping the piece back with no feedback.
 *
 * Keyboard play is complete: arrows move a cursor, Enter picks up and puts
 * down, Escape cancels. Combined with the ARIA grid in board.js that makes the
 * whole game playable without a pointer.
 */

import { FILES, RANKS } from '../core/rules.js';

const DRAG_THRESHOLD = 5; // px before a press becomes a drag

export class BoardInput {
  /**
   * @param {import('./board.js').Board} board
   * @param {{onMove:(from:string,to:string)=>void,
   *          canPickUp:(square:string)=>boolean,
   *          getTargets:(square:string)=>string[],
   *          onSelectionChange?:(sel:string|null, targets:string[])=>void}} handlers
   */
  constructor(board, handlers) {
    this.board = board;
    this.h = handlers;
    this.enabled = true;
    this.selected = null;
    this.targets = [];
    this.cursor = 'e4';

    this.drag = null;
    this._bind();
  }

  // -- selection -----------------------------------------------------------

  select(square) {
    if (!this.h.canPickUp(square)) return false;
    this.selected = square;
    this.targets = this.h.getTargets(square) || [];
    this._emit();
    return true;
  }

  clear() {
    if (!this.selected) return;
    this.selected = null;
    this.targets = [];
    this._emit();
  }

  _emit() {
    this.h.onSelectionChange?.(this.selected, this.targets);
  }

  setEnabled(on) {
    this.enabled = on;
    if (!on) this.clear();
  }

  // -- pointer -------------------------------------------------------------

  _bind() {
    const root = this.board.root;
    root.addEventListener('pointerdown', this._onDown, { passive: false });
    root.addEventListener('keydown', this._onKeyDown);
    // Cursor squares are focusable targets; keep the visual cursor in sync.
    root.addEventListener('focusin', (e) => {
      const square = e.target?.dataset?.square;
      if (square) this.cursor = square;
    });
  }

  _onDown = (event) => {
    if (!this.enabled || event.button > 0) return;
    const square = this.board.squareAt(event.clientX, event.clientY);
    if (!square) return;

    this.cursor = square;

    // Completing a move onto a highlighted target.
    if (this.selected && this.targets.includes(square)) {
      const from = this.selected;
      this.clear();
      this.h.onMove(from, square);
      return;
    }

    if (this.selected === square) {
      this.clear();
      return;
    }

    if (!this.h.canPickUp(square)) {
      this.clear();
      return;
    }

    event.preventDefault();
    this.select(square);

    this.drag = {
      square,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
      pointerId: event.pointerId,
    };
    window.addEventListener('pointermove', this._onMove, { passive: false });
    window.addEventListener('pointerup', this._onUp);
    window.addEventListener('pointercancel', this._onCancel);
  };

  _onMove = (event) => {
    const d = this.drag;
    if (!d || event.pointerId !== d.pointerId) return;

    const dx = event.clientX - d.startX;
    const dy = event.clientY - d.startY;
    if (!d.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;

    if (!d.moved) {
      d.moved = true;
      this.board.lift(d.square, true);
    }
    event.preventDefault();

    const rect = this.board.root.getBoundingClientRect();
    // Percentages are relative to the piece's own box (one eighth of the board),
    // so one square of travel is exactly 100%.
    const xPct = (((event.clientX - rect.left) / rect.width) * 8 - 0.5) * 100;
    const yPct = (((event.clientY - rect.top) / rect.height) * 8 - 0.5) * 100;
    this.board.dragTo(d.square, xPct, yPct);
  };

  _onUp = (event) => {
    const d = this.drag;
    if (!d) return;
    this._teardownDrag();

    const from = d.square;
    if (!d.moved) return; // a tap: selection stays, waiting for a destination

    this.board.lift(from, false);
    const to = this.board.squareAt(event.clientX, event.clientY);

    if (to && to !== from && this.targets.includes(to)) {
      this.clear();
      this.h.onMove(from, to);
    } else {
      this.board.resetPiece(from);
      this.clear();
    }
  };

  _onCancel = () => {
    const d = this.drag;
    if (!d) return;
    this._teardownDrag();
    this.board.lift(d.square, false);
    this.board.resetPiece(d.square);
    this.clear();
  };

  _teardownDrag() {
    this.drag = null;
    window.removeEventListener('pointermove', this._onMove);
    window.removeEventListener('pointerup', this._onUp);
    window.removeEventListener('pointercancel', this._onCancel);
  }

  // -- keyboard ------------------------------------------------------------

  _onKeyDown = (event) => {
    if (!this.enabled) return;

    const step = { ArrowUp: [0, 1], ArrowDown: [0, -1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] }[event.key];
    if (step) {
      event.preventDefault();
      const flip = this.board.orientation === 'b' ? -1 : 1;
      let f = FILES.indexOf(this.cursor[0]) + step[0] * flip;
      let r = RANKS.indexOf(this.cursor[1]) + step[1] * flip;
      f = Math.max(0, Math.min(7, f));
      r = Math.max(0, Math.min(7, r));
      this.focusSquare(FILES[f] + RANKS[r]);
      return;
    }

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      const square = this.cursor;
      if (this.selected && this.targets.includes(square)) {
        const from = this.selected;
        this.clear();
        this.h.onMove(from, square);
      } else if (this.selected === square) {
        this.clear();
      } else {
        this.select(square);
      }
      return;
    }

    if (event.key === 'Escape') {
      this.clear();
    }
  };

  focusSquare(square) {
    this.cursor = square;
    const cell = this.board.cellFor(square);
    if (cell) cell.focus({ preventScroll: true });
  }

  /** Makes exactly one cell tabbable so the board is a single tab stop. */
  refreshTabStop() {
    for (const [square, cell] of this.board.cells) {
      cell.tabIndex = square === this.cursor ? 0 : -1;
    }
  }
}
