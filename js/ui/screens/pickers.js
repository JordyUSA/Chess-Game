/** Tier picker (Practice) and motif picker (Drills). */

import { icon } from '../icons.js';
import { escapeHtml } from './puzzle.js';
import { themeName, THEMES, drillOrder } from '../../core/explain.js';

export function renderTierPicker(root, { navigate, index, onPick }) {
  root.innerHTML = `
    <div class="screen">
      <div class="puzzle-head">
        <button class="btn btn-icon" data-nav="home" aria-label="Back">${icon('back')}</button>
        <div>
          <div class="card-title">Practice</div>
          <div class="card-sub">Pick a difficulty. Positions are sparse on purpose.</div>
        </div>
      </div>
      <div class="tier-grid">
        ${index.tiers.map((t) => `
          <button class="tier-btn" data-tier="${t.tier}">
            <span class="tier-name">${escapeHtml(t.name)}</span>
            <span class="tier-meta">${t.count} puzzles · ${t.rating[0]}–${t.rating[1] > 9000 ? '∞' : t.rating[1]}</span>
            <span class="tier-bar"><i style="width:${(t.tier / index.tiers.length) * 100}%"></i></span>
          </button>
        `).join('')}
      </div>
      <p class="small muted">
        Ratings come from the Lichess database — roughly the Elo at which players
        solve the puzzle half the time.
      </p>
    </div>
  `;

  root.addEventListener('click', (event) => {
    const back = event.target.closest('[data-nav]');
    if (back) { navigate(back.dataset.nav); return; }
    const tier = event.target.closest('[data-tier]');
    if (tier) onPick(Number(tier.dataset.tier));
  });
}

export function renderThemePicker(root, { navigate, index, onPick }) {
  const available = index.themes || {};
  const order = drillOrder(available);

  root.innerHTML = `
    <div class="screen">
      <div class="puzzle-head">
        <button class="btn btn-icon" data-nav="home" aria-label="Back">${icon('back')}</button>
        <div>
          <div class="card-title">Motif drills</div>
          <div class="card-sub">One tactic at a time. The pattern is the point.</div>
        </div>
      </div>
      <div class="stack">
        ${order.map((tag) => `
          <button class="card card-link" data-theme="${escapeHtml(tag)}">
            <span class="card-body">
              <span class="card-title">${escapeHtml(themeName(tag))}</span>
              <span class="card-sub">${escapeHtml(shortBlurb(tag))}</span>
            </span>
            <span class="chip">${available[tag]}</span>
            <span class="card-chev">${icon('chevron')}</span>
          </button>
        `).join('')}
      </div>
    </div>
  `;

  root.addEventListener('click', (event) => {
    const back = event.target.closest('[data-nav]');
    if (back) { navigate(back.dataset.nav); return; }
    const theme = event.target.closest('[data-theme]');
    if (theme) onPick(theme.dataset.theme);
  });
}

/** First sentence of the motif's explanation, for the list row. */
function shortBlurb(tag) {
  const full = THEMES[tag]?.blurb || '';
  const stop = full.indexOf('. ');
  return stop > 0 ? full.slice(0, stop + 1) : full;
}
