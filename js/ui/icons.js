/** Inline SVG icons. Stroke-based, 24x24, inheriting currentColor. */

const wrap = (paths, fill = false) =>
  `<svg viewBox="0 0 24 24" ${fill ? 'fill="currentColor"' : 'fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"'} aria-hidden="true">${paths}</svg>`;

export const icons = {
  calendar: wrap('<rect x="3" y="4.5" width="18" height="16" rx="2.5"></rect><path d="M8 2.5v4M16 2.5v4M3 9.5h18"></path>'),
  target: wrap('<circle cx="12" cy="12" r="8.5"></circle><circle cx="12" cy="12" r="4.5"></circle><circle cx="12" cy="12" r="1"></circle>'),
  layers: wrap('<path d="M12 3 3 7.5l9 4.5 9-4.5z"></path><path d="M3 12.5 12 17l9-4.5"></path><path d="M3 17 12 21.5 21 17"></path>'),
  repeat: wrap('<path d="M17 2.5 21 6.5l-4 4"></path><path d="M3 11.5v-1a4 4 0 0 1 4-4h14"></path><path d="M7 21.5 3 17.5l4-4"></path><path d="M21 12.5v1a4 4 0 0 1-4 4H3"></path>'),
  cpu: wrap('<rect x="5" y="5" width="14" height="14" rx="2.5"></rect><rect x="9" y="9" width="6" height="6" rx="1"></rect><path d="M9 2.5v2.5M15 2.5v2.5M9 19v2.5M15 19v2.5M2.5 9H5M2.5 15H5M19 9h2.5M19 15h2.5"></path>'),
  chart: wrap('<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"></path>'),
  chevron: wrap('<path d="m9 5 7 7-7 7"></path>'),
  back: wrap('<path d="m15 5-7 7 7 7"></path>'),
  bulb: wrap('<path d="M9 18h6"></path><path d="M10 21.5h4"></path><path d="M12 2.5a6.5 6.5 0 0 0-4 11.6V16h8v-1.9a6.5 6.5 0 0 0-4-11.6z"></path>'),
  check: wrap('<path d="m4.5 12.5 5 5 10-11"></path>'),
  x: wrap('<path d="M6 6l12 12M18 6 6 18"></path>'),
  share: wrap('<path d="M12 15.5V3.5"></path><path d="m7.5 8 4.5-4.5L16.5 8"></path><path d="M4.5 14v5a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-5"></path>'),
  flip: wrap('<path d="M3.5 8.5 12 3l8.5 5.5"></path><path d="M20.5 15.5 12 21l-8.5-5.5"></path>'),
  next: wrap('<path d="M5 12h13"></path><path d="m12 5.5 6.5 6.5-6.5 6.5"></path>'),
  sparkle: wrap('<path d="M12 3.5 13.8 9l5.7 1.8-5.7 1.8L12 18.5l-1.8-5.9L4.5 10.8 10.2 9z"></path><path d="M18.5 3v3M20 4.5h-3"></path>'),
  trophy: wrap('<path d="M7.5 4h9v5a4.5 4.5 0 0 1-9 0z"></path><path d="M7.5 5.5H5A2.5 2.5 0 0 0 5 10.5h1"></path><path d="M16.5 5.5H19a2.5 2.5 0 0 1 0 5h-1"></path><path d="M12 13.5V17"></path><path d="M8.5 20.5h7"></path><path d="M10 17h4v3.5h-4z"></path>'),
  clock: wrap('<circle cx="12" cy="12" r="8.5"></circle><path d="M12 7v5.2l3.2 2"></path>'),
  inbox: wrap('<path d="M3.5 13.5h4l1.5 3h6l1.5-3h4"></path><path d="M5.6 4.5h12.8l3.1 9v5a2 2 0 0 1-2 2H4.5a2 2 0 0 1-2-2v-5z"></path>'),
  undo: wrap('<path d="M8 6.5 3.5 11 8 15.5"></path><path d="M3.5 11h11a5.5 5.5 0 0 1 0 11h-3"></path>'),
  eye: wrap('<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"></path><circle cx="12" cy="12" r="3"></circle>'),
  flame: wrap('<path d="M12 2.5s5.5 4.5 5.5 9.5a5.5 5.5 0 0 1-11 0c0-1.7.7-3.2 1.6-4.4.4 1 1.1 1.9 2 2.3 0-2.9.9-5.6 1.9-7.4z"></path>', true),
};

export function icon(name) {
  return icons[name] || '';
}
