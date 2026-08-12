/** Home: the daily puzzle, then every other mode. */

import { icon } from '../icons.js';
import { escapeHtml } from './puzzle.js';
import { today, formatKey } from '../../core/dates.js';
import { getStreak, getProfile } from '../../core/store.js';
import { displayStreak, solvedOn } from '../../core/daily.js';
import { summary as srsSummary } from '../../core/srs.js';

export function renderHome(root, { navigate, index }) {
  const streak = getStreak();
  const stats = getProfile().stats;
  const day = today();
  const doneToday = solvedOn(day, streak);
  const current = displayStreak(streak, day);
  const due = srsSummary(day).due;
  const total = index?.total ?? 0;

  root.innerHTML = `
    <div class="screen">
      <button class="hero" data-nav="daily">
        <div class="hero-label">${doneToday ? 'Daily · done' : 'Daily puzzle'}</div>
        <div class="hero-title">${escapeHtml(formatKey(day))}</div>
        <div class="hero-sub">
          ${doneToday
            ? 'Solved today. Come back tomorrow to extend the streak.'
            : 'One puzzle. Everyone gets the same one.'}
        </div>
        ${current > 0 ? `
          <div class="hero-flame">
            <div class="hero-flame-n">${current}</div>
            <div class="hero-flame-l">streak</div>
          </div>` : ''}
      </button>

      <div class="section-head"><span class="section-title">Train</span></div>
      <div class="stack">
        ${cardLink('practice', 'target', 'Practice', `${total.toLocaleString()} puzzles across five difficulty tiers`)}
        ${cardLink('themes', 'layers', 'Motif drills', 'Train one tactic at a time — forks, pins, back-rank mates')}
        ${cardLink('review', 'repeat', 'Review',
            due > 0 ? `${due} puzzle${due === 1 ? '' : 's'} due for review` : 'Puzzles you missed come back here',
            due > 0 ? `<span class="badge-count">${due}</span>` : '')}
      </div>

      <div class="section-head"><span class="section-title">Play</span></div>
      <div class="stack">
        ${cardLink('play', 'cpu', 'Play the computer', 'Five strengths, from gentle to genuinely annoying')}
        ${cardLink('stats', 'chart', 'Progress', `${stats.solved} solved · best streak ${streak.best || 0}`)}
      </div>
    </div>
  `;

  root.addEventListener('click', (event) => {
    const target = event.target.closest('[data-nav]');
    if (target) navigate(target.dataset.nav);
  });
}

function cardLink(route, iconName, title, sub, trailing = '') {
  return `
    <button class="card card-link" data-nav="${route}">
      <span class="card-icon">${icon(iconName)}</span>
      <span class="card-body">
        <span class="card-title">${escapeHtml(title)}</span>
        <span class="card-sub">${escapeHtml(sub)}</span>
      </span>
      ${trailing}
      <span class="card-chev">${icon('chevron')}</span>
    </button>
  `;
}
