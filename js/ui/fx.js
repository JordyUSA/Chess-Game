/**
 * Small presentation helpers: announcements, toasts, confetti, number ticks.
 * Everything here checks prefers-reduced-motion before animating.
 */

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Announces a message to screen readers without moving focus. */
export function announce(message) {
  const region = document.getElementById('live-region');
  if (!region) return;
  // Clearing first forces AT to re-read an identical consecutive message.
  region.textContent = '';
  requestAnimationFrame(() => { region.textContent = message; });
}

export function toast(message, ms = 2000) {
  const host = document.getElementById('toast-host');
  if (!host) return;
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = message;
  host.appendChild(el);
  setTimeout(() => {
    el.style.transition = 'opacity 180ms linear, transform 180ms ease';
    el.style.opacity = '0';
    el.style.transform = 'translateY(6px)';
    setTimeout(() => el.remove(), 200);
  }, ms);
}

const CONFETTI_COLOURS = ['#3f9a6b', '#e6b422', '#4f9ecf', '#d1685a', '#8a6fc4'];

/**
 * A restrained burst over the board. Uses WAAPI so the compositor owns it and
 * the main thread stays free for input.
 */
export function confetti(container, count = 26) {
  if (!container || reduced()) return;
  let host = container.querySelector('.confetti-host');
  if (!host) {
    host = document.createElement('div');
    host.className = 'confetti-host';
    host.setAttribute('aria-hidden', 'true');
    container.appendChild(host);
  }

  for (let i = 0; i < count; i++) {
    const bit = document.createElement('i');
    bit.className = 'confetti-bit';
    bit.style.background = CONFETTI_COLOURS[i % CONFETTI_COLOURS.length];
    bit.style.left = `${12 + Math.random() * 76}%`;
    bit.style.top = '44%';
    host.appendChild(bit);

    const dx = (Math.random() - 0.5) * 260;
    const dy = -90 - Math.random() * 130;
    const spin = (Math.random() - 0.5) * 900;
    const duration = 900 + Math.random() * 700;

    const anim = bit.animate(
      [
        { transform: 'translate(0,0) rotate(0deg)', opacity: 1 },
        { transform: `translate(${dx * 0.6}px, ${dy}px) rotate(${spin * 0.6}deg)`, opacity: 1, offset: 0.42 },
        { transform: `translate(${dx}px, ${dy + 260}px) rotate(${spin}deg)`, opacity: 0 },
      ],
      { duration, easing: 'cubic-bezier(.16,.7,.4,1)', fill: 'forwards' }
    );
    anim.onfinish = () => bit.remove();
  }
}

/** Counts a number up. Falls back to setting it directly when motion is reduced. */
export function tickNumber(el, to, ms = 550) {
  if (!el) return;
  const from = Number(el.textContent.replace(/\D/g, '')) || 0;
  if (reduced() || from === to) { el.textContent = String(to); return; }
  const start = performance.now();
  const step = (now) => {
    const t = Math.min(1, (now - start) / ms);
    const eased = 1 - Math.pow(1 - t, 3);
    el.textContent = String(Math.round(from + (to - from) * eased));
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/** Brief attention pulse on any element. */
export function pulse(el) {
  if (!el || reduced()) return;
  el.animate(
    [{ transform: 'scale(1)' }, { transform: 'scale(1.08)' }, { transform: 'scale(1)' }],
    { duration: 320, easing: 'ease-out' }
  );
}

/** Copies text, preferring the share sheet on mobile. Returns how it went. */
export async function shareOrCopy(text, title = 'Pocket Chess') {
  if (navigator.share) {
    try {
      await navigator.share({ title, text });
      return 'shared';
    } catch (err) {
      if (err && err.name === 'AbortError') return 'cancelled';
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    return 'copied';
  } catch {
    return 'failed';
  }
}
