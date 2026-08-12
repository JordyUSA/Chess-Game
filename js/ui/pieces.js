/**
 * Chess piece artwork.
 *
 * Hand-authored geometric silhouettes, drawn for this project. This is a
 * deliberate licensing decision as much as an aesthetic one: the classic
 * Cburnett set is GPL/CC-BY-SA and roughly half the Lichess piece sets are
 * CC-BY-NC-SA, none of which we want to inherit. Drawing our own costs ~4 KB,
 * carries no obligations, and suits the minimal look better than a scanned
 * Staunton set would.
 *
 * Each piece is a <symbol> on a 45x45 grid with the baseline at y=41, so all
 * six sit on a common footing. Fill and stroke come from CSS custom properties
 * so one sprite serves both colours and every board theme.
 */

const PIECE_SHAPES = {
  king: `
    <rect x="20.9" y="3" width="3.2" height="11" rx="1.6"/>
    <rect x="17.4" y="6.6" width="10.2" height="3.2" rx="1.6"/>
    <path d="M22.5 14.6c-6.4 0-11.6 4.3-11.6 9.6 0 3.3 1.7 5.4 3.4 7.1h16.4c1.7-1.7 3.4-3.8 3.4-7.1 0-5.3-5.2-9.6-11.6-9.6z"/>
    <rect x="11.6" y="30.6" width="21.8" height="4" rx="2"/>
    <rect x="8.4" y="36.6" width="28.2" height="4.6" rx="2.3"/>`,

  queen: `
    <circle cx="6.4" cy="10.6" r="2.7"/>
    <circle cx="14.4" cy="8.2" r="2.7"/>
    <circle cx="22.5" cy="7.2" r="2.9"/>
    <circle cx="30.6" cy="8.2" r="2.7"/>
    <circle cx="38.6" cy="10.6" r="2.7"/>
    <path d="M6.4 11.4 10 30.2h25L38.6 11.4 31 19.9l-4.3-9.6-4.2 9.2-4.2-9.2-4.3 9.6z"/>
    <rect x="10.4" y="30.8" width="24.2" height="3.9" rx="1.9"/>
    <rect x="8.4" y="36.6" width="28.2" height="4.6" rx="2.3"/>`,

  rook: `
    <path d="M10.6 8.4h6.1v3.9h4.1V8.4h5.5v3.9h4.1V8.4h6.1v9.9l-3.2 2.6v11.2l3.2 2.6v2.1H10.6v-2.1l3.2-2.6V20.9l-3.2-2.6z"/>
    <rect x="8.4" y="36.6" width="28.2" height="4.6" rx="2.3"/>`,

  bishop: `
    <circle cx="22.5" cy="7.4" r="2.9"/>
    <path d="M22.5 10.2c-4.9 3.4-8.6 8.2-8.6 13.4 0 3.9 2.4 6.9 5.4 8.6h6.4c3-1.7 5.4-4.7 5.4-8.6 0-5.2-3.7-10-8.6-13.4z"/>
    <rect x="13.6" y="31.2" width="17.8" height="3.7" rx="1.8"/>
    <rect x="8.4" y="36.6" width="28.2" height="4.6" rx="2.3"/>`,

  knight: `
    <path d="M23.4 5.6c-1.4 0-2.6.7-3.3 1.9l-1.3 2.1-4 1.7c-2.9 1.2-5 3.9-5.6 7l-.8 4.6c-.3 1.6 1 3 2.6 3 .9 0 1.7-.5 2.2-1.2l2-3 2.6 1-3.6 4.9c-2.1 2.9-3.3 6.4-3.3 10v2.3h23.4v-7.1c0-10.6-4.7-19.9-10.6-25.3-.7-.6-1.5-.9-2.3-.9z"/>
    <rect x="8.4" y="36.6" width="28.2" height="4.6" rx="2.3"/>`,

  pawn: `
    <circle cx="22.5" cy="13.4" r="6.6"/>
    <path d="M22.5 19.2c-4.1 0-7.2 2.4-7.2 5.4 0 2 1.3 3.4 2.7 4.3-3.4 2.3-5.8 5.2-6.6 9.4h22.2c-.8-4.2-3.2-7.1-6.6-9.4 1.4-.9 2.7-2.3 2.7-4.3 0-3-3.1-5.4-7.2-5.4z"/>
    <rect x="9.4" y="36.6" width="26.2" height="4.6" rx="2.3"/>`,
};

const CODE_TO_NAME = { k: 'king', q: 'queen', r: 'rook', b: 'bishop', n: 'knight', p: 'pawn' };

/**
 * The full sprite, injected once into the document. Symbols are ids like "wn"
 * (white knight) and "bq" (black queen), referenced with <use href="#wn">.
 */
export function spriteMarkup() {
  const symbols = [];
  for (const [code, name] of Object.entries(CODE_TO_NAME)) {
    for (const colour of ['w', 'b']) {
      symbols.push(
        `<symbol id="${colour}${code}" viewBox="0 0 45 45">` +
          `<g class="pc pc-${colour}">${PIECE_SHAPES[name]}</g>` +
        `</symbol>`
      );
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" aria-hidden="true" style="position:absolute;width:0;height:0;overflow:hidden">${symbols.join('')}</svg>`;
}

export function installSprite(doc = document) {
  if (doc.getElementById('piece-sprite')) return;
  const host = doc.createElement('div');
  host.id = 'piece-sprite';
  host.setAttribute('aria-hidden', 'true');
  host.innerHTML = spriteMarkup();
  doc.body.prepend(host);
}

/** An <svg><use> element for a chess.js piece ({ type, color }). */
export function pieceElement(piece) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'piece');
  svg.setAttribute('viewBox', '0 0 45 45');
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', `#${piece.color}${piece.type}`);
  svg.appendChild(use);
  return svg;
}
