/** Settings bottom sheet. */

import { getProfile, updatePrefs, resetAll, exportAll } from '../core/store.js';
import { setSoundEnabled, sfx } from './sound.js';
import { toast, shareOrCopy } from './fx.js';
import { escapeHtml } from './screens/puzzle.js';

const BOARD_THEMES = [
  { id: 'sage', name: 'Sage' },
  { id: 'wood', name: 'Wood' },
  { id: 'slate', name: 'Slate' },
  { id: 'mint', name: 'Mint' },
  { id: 'contrast', name: 'High contrast' },
];

const APPEARANCE = [
  { id: 'system', name: 'System' },
  { id: 'light', name: 'Light' },
  { id: 'dark', name: 'Dark' },
];

export function openSettings({ onChange } = {}) {
  const prefs = getProfile().prefs;

  const backdrop = document.createElement('div');
  backdrop.className = 'sheet-backdrop';
  backdrop.innerHTML = `
    <div class="sheet" role="dialog" aria-modal="true" aria-label="Settings">
      <div class="sheet-grip"></div>
      <div class="sheet-title">Settings</div>

      <div class="setting">
        <div class="setting-label">
          <div class="setting-name">Appearance</div>
          <div class="setting-hint">Follows your system unless you pick one</div>
        </div>
      </div>
      <div class="chip-wrap" data-group="theme">
        ${APPEARANCE.map((t) => `
          <button class="chip chip-btn" data-theme="${t.id}" aria-pressed="${prefs.theme === t.id}">
            ${escapeHtml(t.name)}
          </button>`).join('')}
      </div>

      <div class="setting" style="margin-top:.75rem">
        <div class="setting-label">
          <div class="setting-name">Board</div>
          <div class="setting-hint">High contrast is colour-blind safe</div>
        </div>
      </div>
      <div class="chip-wrap" data-group="board">
        ${BOARD_THEMES.map((t) => `
          <button class="chip chip-btn" data-board="${t.id}" aria-pressed="${prefs.boardTheme === t.id}">
            ${escapeHtml(t.name)}
          </button>`).join('')}
      </div>

      <div style="height:.75rem"></div>

      ${toggle('focusMode', 'Focus mode', 'Dim the board outside the action', prefs.focusMode !== false)}
      ${toggle('coordinates', 'Coordinates', 'Show file and rank labels', prefs.coordinates !== false)}
      ${toggle('sound', 'Sound', 'Synthesised, no downloads', prefs.sound !== false)}
      ${toggle('haptics', 'Haptics', 'Vibrate on move, where supported', prefs.haptics !== false)}

      <div class="btn-row" style="margin-top:1rem">
        <button class="btn" data-act="export">Export data</button>
        <button class="btn" data-act="reset">Reset progress</button>
      </div>
      <button class="btn btn-primary" data-act="close" style="width:100%;margin-top:.5rem">Done</button>

      <p class="small muted" style="margin-top:1rem;text-align:center">
        Puzzles from the Lichess open database (CC0). Rules by chess.js (BSD-2).
        Everything else written for this project.
      </p>
    </div>
  `;

  document.body.appendChild(backdrop);
  const sheet = backdrop.querySelector('.sheet');
  sheet.querySelector('[data-act="close"]')?.focus();

  const close = () => {
    backdrop.remove();
    document.removeEventListener('keydown', onKey);
  };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);

  backdrop.addEventListener('click', async (event) => {
    if (event.target === backdrop) { close(); return; }

    const themeBtn = event.target.closest('[data-theme]');
    if (themeBtn) {
      const value = themeBtn.dataset.theme;
      updatePrefs({ theme: value });
      if (value === 'system') delete document.documentElement.dataset.theme;
      else document.documentElement.dataset.theme = value;
      setPressed(sheet, '[data-theme]', themeBtn);
      onChange?.();
      return;
    }

    const boardBtn = event.target.closest('[data-board]');
    if (boardBtn) {
      const value = boardBtn.dataset.board;
      updatePrefs({ boardTheme: value });
      document.documentElement.dataset.board = value;
      setPressed(sheet, '[data-board]', boardBtn);
      return;
    }

    const action = event.target.closest('[data-act]')?.dataset.act;
    if (action === 'close') close();
    else if (action === 'export') {
      const result = await shareOrCopy(JSON.stringify(exportAll(), null, 2), 'Pocket Chess data');
      toast(result === 'copied' ? 'Copied to clipboard' : result === 'shared' ? 'Shared' : 'Could not copy');
    } else if (action === 'reset') {
      if (confirm('Reset all progress? Streak, stats and review schedule will be erased.')) {
        resetAll();
        close();
        onChange?.({ reset: true });
        toast('Progress reset');
      }
    }
  });

  backdrop.addEventListener('change', (event) => {
    const input = event.target.closest('input[data-pref]');
    if (!input) return;
    const key = input.dataset.pref;
    const value = input.checked;
    updatePrefs({ [key]: value });
    if (key === 'sound') {
      setSoundEnabled(value);
      if (value) sfx.tick();
    }
    onChange?.();
  });
}

function toggle(key, name, hint, checked) {
  return `
    <div class="setting">
      <div class="setting-label">
        <div class="setting-name">${escapeHtml(name)}</div>
        <div class="setting-hint">${escapeHtml(hint)}</div>
      </div>
      <label class="switch">
        <input type="checkbox" data-pref="${key}" ${checked ? 'checked' : ''}
               aria-label="${escapeHtml(name)}">
        <span></span>
      </label>
    </div>
  `;
}

function setPressed(scope, selector, active) {
  scope.querySelectorAll(selector).forEach((b) => {
    b.setAttribute('aria-pressed', String(b === active));
  });
}
