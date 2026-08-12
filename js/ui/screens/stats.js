/** Progress: totals, streak calendar, and the review pipeline. */

import { icon } from '../icons.js';
import { escapeHtml } from './puzzle.js';
import { getProfile, getStreak, getHistory } from '../../core/store.js';
import { summary as srsSummary, INTERVALS } from '../../core/srs.js';
import { recentDays, displayStreak } from '../../core/daily.js';
import { today, formatKey } from '../../core/dates.js';

export function renderStats(root, { navigate }) {
  const { stats } = getProfile();
  const streak = getStreak();
  const srs = srsSummary();
  const history = getHistory();
  const day = today();
  const days = recentDays(28, day, streak);

  const cleanRate = stats.solved ? Math.round((stats.clean / stats.solved) * 100) : 0;
  const avgTries = stats.solved ? (1 + stats.attempts / stats.solved).toFixed(2) : '—';

  root.innerHTML = `
    <div class="screen">
      <div class="puzzle-head">
        <button class="btn btn-icon" data-nav="home" aria-label="Back">${icon('back')}</button>
        <div>
          <div class="card-title">Progress</div>
          <div class="card-sub">${stats.solved ? `Since ${escapeHtml(formatKey(startDate(history, day)))}` : 'No puzzles solved yet'}</div>
        </div>
      </div>

      <div class="stat-grid">
        ${stat(stats.solved, 'solved')}
        ${stat(displayStreak(streak, day), 'streak')}
        ${stat(streak.best || 0, 'best')}
        ${stat(`${cleanRate}%`, 'first try')}
      </div>

      <div class="card">
        <div class="section-head" style="padding-top:0">
          <span class="section-title">Last four weeks</span>
        </div>
        <div style="display:grid;grid-template-columns:repeat(14,1fr);gap:4px;margin-top:.6rem">
          ${days.map((d) => `
            <span title="${escapeHtml(formatKey(d.key))}${d.solved ? ' — solved' : ''}"
                  aria-label="${escapeHtml(formatKey(d.key))}${d.solved ? ', solved' : ', not solved'}"
                  style="aspect-ratio:1;border-radius:4px;background:${d.solved ? 'var(--accent)' : 'var(--surface-3)'}"></span>
          `).join('')}
        </div>
      </div>

      <div class="card">
        <div class="section-head" style="padding-top:0">
          <span class="section-title">Review pipeline</span>
          <span class="spacer"></span>
          ${srs.due > 0 ? `<button class="chip chip-accent chip-btn" data-nav="review">${srs.due} due</button>` : ''}
        </div>
        ${srs.tracked === 0
          ? `<p class="small muted" style="margin-top:.5rem">
               Nothing tracked yet. Puzzles you miss are scheduled to come back —
               tomorrow, then two days, then four, until they stick.
             </p>`
          : `<div style="display:flex;gap:.35rem;align-items:flex-end;height:64px;margin-top:.7rem">
               ${srs.boxes.map((n, i) => {
                 const max = Math.max(1, ...srs.boxes);
                 return `<div style="flex:1;text-align:center">
                   <div style="height:${Math.round((n / max) * 44)}px;background:var(--accent);border-radius:3px;min-height:${n ? 3 : 0}px"></div>
                   <div class="tier-meta" style="margin-top:.25rem">${n}</div>
                   <div class="tier-meta">${INTERVALS[i]}d</div>
                 </div>`;
               }).join('')}
             </div>
             <p class="small muted" style="margin-top:.5rem">
               ${srs.tracked} tracked · ${srs.due} due · ${srs.pending} waiting
             </p>`}
      </div>

      <div class="card">
        <div class="section-head" style="padding-top:0"><span class="section-title">Detail</span></div>
        <div class="stat-grid" style="margin-top:.6rem">
          ${stat(avgTries, 'avg tries')}
          ${stat(stats.hintsUsed, 'hints used')}
          ${stat(srs.tracked, 'in review')}
        </div>
      </div>

      ${history.length ? `
        <div class="card">
          <div class="section-head" style="padding-top:0"><span class="section-title">Recent</span></div>
          <div class="stack" style="margin-top:.5rem">
            ${history.slice(0, 8).map((h) => `
              <div style="display:flex;align-items:center;gap:.5rem;font-size:.85rem">
                <span class="chip ${h.attempts === 0 && h.hints === 0 ? 'chip-good' : 'chip-warn'}">
                  ${h.attempts === 0 && h.hints === 0 ? 'clean' : `${h.attempts + 1} tries`}
                </span>
                <span class="muted mono">${h.rating || ''}</span>
                <span class="spacer" style="flex:1"></span>
                <span class="muted small">${escapeHtml(h.date)}</span>
              </div>
            `).join('')}
          </div>
        </div>` : ''}
    </div>
  `;

  root.addEventListener('click', (event) => {
    const nav = event.target.closest('[data-nav]');
    if (nav) navigate(nav.dataset.nav);
  });
}

function stat(value, label) {
  return `<div class="stat"><div class="stat-n">${escapeHtml(value)}</div><div class="stat-l">${escapeHtml(label)}</div></div>`;
}

function startDate(history, fallback) {
  if (!history.length) return fallback;
  return history[history.length - 1].date || fallback;
}
