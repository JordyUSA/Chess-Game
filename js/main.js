/**
 * App bootstrap and hash router.
 *
 * Routes:
 *   #/                  home
 *   #/daily             puzzle of the day
 *   #/practice          tier picker      #/practice/3   tier 3
 *   #/themes            motif picker     #/themes/fork  fork drill
 *   #/review            spaced-repetition queue
 *   #/play  #/stats
 */

import { installSprite } from './ui/pieces.js';
import { initSound } from './ui/sound.js';
import { toast, shareOrCopy, announce } from './ui/fx.js';
import { icon } from './ui/icons.js';
import { openSettings } from './ui/settings.js';
import { renderHome } from './ui/screens/home.js';
import { renderTierPicker, renderThemePicker } from './ui/screens/pickers.js';
import { renderPuzzleScreen, escapeHtml } from './ui/screens/puzzle.js';
import { renderPlay } from './ui/screens/play.js';
import { renderStats } from './ui/screens/stats.js';
import {
  loadIndex, loadTier, loadDaily, puzzlesWithTheme, puzzlesByIds, makeQueue,
} from './data.js';
import { pickDaily, registerDailySolve, displayStreak, shareText, solvedOn } from './core/daily.js';
import { getStreak } from './core/store.js';
import { today } from './core/dates.js';
import { themeName } from './core/explain.js';
import { dueIds } from './core/srs.js';

const main = document.getElementById('main');
let index = null;

// -- chrome ------------------------------------------------------------------

function refreshChrome() {
  const streak = getStreak();
  const current = displayStreak(streak, today());
  const pill = document.getElementById('streak-pill');
  if (!pill) return;
  pill.hidden = current === 0;
  pill.innerHTML = `${icon('flame')}<span>${current}</span>`;
}

function navigate(route) {
  location.hash = route.startsWith('#') ? route : `#/${route.replace(/^\/+/, '')}`;
}

function showLoading() {
  main.innerHTML = '<div class="spinner" role="status" aria-label="Loading"></div>';
}

function showError(message, retry) {
  main.innerHTML = `
    <div class="screen">
      <div class="card empty">
        <div class="empty-icon">${icon('x')}</div>
        <div class="empty-title">Could not load</div>
        <div class="empty-sub">${escapeHtml(message)}</div>
      </div>
      <button class="btn btn-primary" data-act="retry">Try again</button>
    </div>`;
  main.querySelector('[data-act="retry"]')?.addEventListener('click', retry);
}

// -- routes ------------------------------------------------------------------

async function routeDaily() {
  showLoading();
  const pool = await loadDaily();
  const day = today();
  const puzzle = pickDaily(pool, day);
  if (!puzzle) { showError('No daily puzzle available.', () => navigate('/')); return; }

  const already = solvedOn(day, getStreak());
  let queue = { next: (() => { let served = false; return () => (served ? null : (served = true, puzzle)); })() };

  renderPuzzleScreen(main, {
    title: 'Daily puzzle',
    subtitle: already ? 'Already solved today — replaying' : 'Same puzzle for everyone today',
    queue,
    showNext: false,
    emptyMessage: 'Come back tomorrow for the next one.',
    onExit: () => navigate('/'),
    onSolved: (session) => {
      const streak = registerDailySolve(day);
      refreshChrome();
      addShareButton(session, day, streak);
      if (!already) {
        announce(`Daily solved. Streak ${streak.current}.`);
      }
    },
  });
}

/** Appends a spoiler-free share control to the post-solve explainer. */
function addShareButton(session, day, streak) {
  const host = main.querySelector('[data-el="explain"] .explain');
  if (!host) return;
  const button = document.createElement('button');
  button.className = 'btn';
  button.style.marginTop = '0.75rem';
  button.innerHTML = `${icon('share')}Share result`;
  button.addEventListener('click', async () => {
    const text = shareText({
      dateKey: day,
      mateIn: session.mateIn,
      attempts: session.attempts,
      hints: session.hintsUsed,
      streak: streak.current,
      solved: true,
    });
    const result = await shareOrCopy(text);
    if (result === 'copied') toast('Result copied — no spoilers included');
    else if (result === 'failed') toast('Could not copy');
  });
  host.appendChild(button);
}

async function routePractice(tier) {
  if (!tier) {
    renderTierPicker(main, { navigate, index, onPick: (t) => navigate(`/practice/${t}`) });
    return;
  }
  showLoading();
  const puzzles = await loadTier(tier);
  const meta = index.tiers.find((t) => t.tier === tier);
  renderPuzzleScreen(main, {
    title: meta ? meta.name : `Tier ${tier}`,
    subtitle: `Practice · ${puzzles.length} puzzles`,
    queue: makeQueue(puzzles),
    onExit: () => navigate('/practice'),
    onSolved: () => refreshChrome(),
  });
}

async function routeThemes(theme) {
  if (!theme) {
    renderThemePicker(main, { navigate, index, onPick: (t) => navigate(`/themes/${t}`) });
    return;
  }
  showLoading();
  const puzzles = await puzzlesWithTheme(theme);
  if (!puzzles.length) { navigate('/themes'); return; }
  renderPuzzleScreen(main, {
    title: themeName(theme),
    subtitle: `Motif drill · ${puzzles.length} puzzles`,
    queue: makeQueue(puzzles),
    onExit: () => navigate('/themes'),
    onSolved: () => refreshChrome(),
  });
}

async function routeReview() {
  showLoading();
  const ids = dueIds();
  if (!ids.length) {
    renderPuzzleScreen(main, {
      title: 'Review',
      subtitle: 'Spaced repetition',
      queue: { next: () => null },
      emptyMessage: 'Nothing due today. Puzzles you miss come back here — tomorrow, then in two days, then four.',
      onExit: () => navigate('/'),
    });
    return;
  }
  const puzzles = await puzzlesByIds(ids);
  let i = 0;
  renderPuzzleScreen(main, {
    title: 'Review',
    subtitle: `${puzzles.length} due today`,
    queue: { next: () => puzzles[i++] || null },
    emptyMessage: 'Review cleared. Nicely done.',
    onExit: () => navigate('/'),
    onSolved: () => refreshChrome(),
  });
}

// -- router ------------------------------------------------------------------

async function route() {
  const hash = location.hash.replace(/^#\/?/, '');
  const [name, arg] = hash.split('/');

  try {
    if (!index) index = await loadIndex();
  } catch (err) {
    showError(err.message, () => route());
    return;
  }

  refreshChrome();
  main.scrollTop = 0;

  try {
    switch (name) {
      case '': case 'home': renderHome(main, { navigate, index }); break;
      case 'daily': await routeDaily(); break;
      case 'practice': await routePractice(arg ? Number(arg) : null); break;
      case 'themes': await routeThemes(arg || null); break;
      case 'review': await routeReview(); break;
      case 'play': renderPlay(main, { navigate }); break;
      case 'stats': renderStats(main, { navigate }); break;
      default: navigate('/');
    }
  } catch (err) {
    showError(err.message || 'Something went wrong.', () => route());
  }
}

// -- boot --------------------------------------------------------------------

function boot() {
  installSprite();
  initSound();

  document.getElementById('home-btn')?.addEventListener('click', () => navigate('/'));
  document.getElementById('settings-btn')?.addEventListener('click', () => {
    openSettings({ onChange: () => refreshChrome() });
  });

  window.addEventListener('hashchange', route);
  route();

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => { /* offline is a bonus */ });
    });
  }
}

boot();
