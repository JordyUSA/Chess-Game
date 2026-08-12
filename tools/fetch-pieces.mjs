#!/usr/bin/env node
/**
 * Builds the bundled piece-set sprite from upstream sources.
 *
 * Like tools/build-puzzles.mjs, this is a committed generator: its output lives
 * in the repo so the app needs no network and no build step.
 *
 * Licensing note that matters — Cburnett is fetched from WIKIMEDIA COMMONS, not
 * from Lichess. The artwork is identical, but Lichess redistributes it under
 * GPLv2+, whereas the upstream file pages offer a choice of GFDL, CC-BY-SA 3.0,
 * BSD 3-clause and GPLv2+. We take the BSD option, which suits this MIT project.
 *
 * Two upstream quirks this has to absorb:
 *   1. Every set uses a different coordinate space (45, 72, 260, 800, 5871, and
 *      papercut in millimetres).
 *   2. kiwen-suwi and cburnett carry no viewBox at all — only width/height. A
 *      <symbol> without a viewBox does not scale, so those pieces would render
 *      at raw pixel size. The viewBox is synthesised from width/height.
 *
 * Usage: node tools/fetch-pieces.mjs
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const TYPES = ['k', 'q', 'r', 'b', 'n', 'p'];
const COLOURS = ['w', 'b'];

const LILA = 'https://raw.githubusercontent.com/lichess-org/lila/master/public/piece';
const WIKIMEDIA = 'https://commons.wikimedia.org/wiki/Special:FilePath';

/**
 * Each set names its author, the licence we are exercising, and how to build a
 * URL for one piece. `notice` is reproduced verbatim in CREDITS.md.
 */
const SETS = [
  {
    id: 'cburnett',
    name: 'Cburnett',
    author: 'Colin M.L. Burnett',
    licence: 'BSD 3-clause',
    // Multi-licensed upstream; we exercise the BSD option.
    source: 'https://commons.wikimedia.org/wiki/Category:SVG_chess_pieces',
    notice:
      'Multi-licensed on Wikimedia Commons under GFDL, CC-BY-SA 3.0, ' +
      'BSD 3-clause and GPLv2+; used here under the BSD 3-clause option.',
    url: (colour, type) =>
      `${WIKIMEDIA}/Chess_${type}${colour === 'w' ? 'l' : 'd'}t45.svg`,
  },
  {
    id: 'chessnut',
    name: 'Chessnut',
    author: 'Alexis Luengas',
    licence: 'Apache 2.0',
    source: 'https://github.com/LichessMobile/chessnut',
    url: (colour, type) => `${LILA}/chessnut/${colour}${type.toUpperCase()}.svg`,
  },
  {
    id: 'rhosgfx',
    name: 'Vector Ranks',
    author: 'RhosGFX',
    licence: 'CC0 1.0',
    source: 'https://rhosgfx.itch.io/vector-chess-pieces',
    notice: 'Public domain dedication — no attribution required, given anyway.',
    url: (colour, type) => `${LILA}/rhosgfx/${colour}${type.toUpperCase()}.svg`,
  },
  {
    id: 'kiwen-suwi',
    name: 'Kiwen Suwi',
    author: 'neverRare',
    licence: 'CC BY 4.0',
    source: 'https://github.com/neverRare/kiwen-suwi',
    url: (colour, type) => `${LILA}/kiwen-suwi/${colour}${type.toUpperCase()}.svg`,
  },
  {
    id: 'totoy',
    name: 'Totoy',
    author: 'Kosal Sen',
    licence: 'CC BY 4.0',
    source: 'https://lichess.org',
    url: (colour, type) => `${LILA}/totoy/${colour}${type.toUpperCase()}.svg`,
  },
  {
    id: 'papercut',
    name: 'Papercut',
    author: 'Nikolay Anzarov',
    licence: 'CC BY 4.0',
    source: 'https://lichess.org',
    url: (colour, type) => `${LILA}/papercut/${colour}${type.toUpperCase()}.svg`,
  },
];

// ---------------------------------------------------------------------------

async function fetchText(url) {
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

/** Numeric value of an SVG length, dropping any unit suffix (px, mm, pt…). */
function toNumber(value) {
  if (!value) return null;
  const m = /^\s*(-?[\d.]+)/.exec(value);
  return m ? Number(m[1]) : null;
}

function attr(tag, name) {
  const m = new RegExp(`${name}\\s*=\\s*"([^"]*)"`, 'i').exec(tag);
  return m ? m[1] : null;
}

/**
 * Folds `<style>` rules into inline style attributes and drops the classes.
 *
 * Necessary because rhosgfx ships `<defs><style>.cls-2{fill:#f4c38e}</style>`
 * per file, and the same class name means different colours in different
 * pieces — `.cls-2` is #f4c38e in the white king but #bb5938 in the black one.
 * Once every set shares one sprite document those rules collide and recolour
 * each other, so the CSS is resolved away here rather than namespaced. The
 * sprite ends up with no CSS at all, which is the only way to be certain no
 * set can restyle another.
 *
 * Only simple single-class selectors are supported; anything else throws so a
 * future set cannot slip through half-converted.
 */
function inlineStyles(body, label) {
  const styleBlocks = [...body.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi)];
  if (!styleBlocks.length) return body;

  const rules = new Map();
  for (const [, css] of styleBlocks) {
    const cleaned = css.replace(/\/\*[\s\S]*?\*\//g, '').trim();
    for (const rule of cleaned.split('}')) {
      if (!rule.trim()) continue;
      const [selector, decls] = rule.split('{');
      if (decls === undefined) throw new Error(`${label}: unparsable CSS rule "${rule}"`);
      const sel = selector.trim();
      const m = /^\.([\w-]+)$/.exec(sel);
      if (!m) throw new Error(`${label}: unsupported CSS selector "${sel}" — only .class is handled`);
      rules.set(m[1], decls.trim().replace(/;$/, ''));
    }
  }

  let out = body.replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, '');
  out = out.replace(/<defs\s*>\s*<\/defs\s*>/gi, '');

  // Merge each class's declarations into the element, keeping any existing
  // inline style last so it still wins, as it would under CSS precedence.
  out = out.replace(/<([\w:-]+)((?:\s+[\w:-]+\s*=\s*"[^"]*")*)\s*(\/?)>/g, (tag, name, attrs, close) => {
    const classAttr = /\sclass\s*=\s*"([^"]*)"/i.exec(attrs);
    if (!classAttr) return tag;
    const declared = classAttr[1].trim().split(/\s+/)
      .map((c) => rules.get(c))
      .filter(Boolean)
      .join(';');
    let rest = attrs.replace(/\sclass\s*=\s*"[^"]*"/i, '');
    if (declared) {
      const existing = /\sstyle\s*=\s*"([^"]*)"/i.exec(rest);
      const merged = existing
        ? `${declared};${existing[1].replace(/;$/, '')}`
        : declared;
      rest = existing
        ? rest.replace(/\sstyle\s*=\s*"[^"]*"/i, ` style="${merged}"`)
        : `${rest} style="${merged}"`;
    }
    return `<${name}${rest}${close ? ' /' : ''}>`;
  });

  return out;
}

/**
 * Prefixes every internal id and rewrites the references to it.
 *
 * Upstream files are written as standalone documents, so they reuse short ids
 * freely: all twelve kiwen-suwi pieces define `<clipPath id="a">`, and papercut
 * repeats gradient and filter ids across pieces. Concatenated into one sprite,
 * every `url(#a)` resolves to whichever `#a` came first — which clipped eleven
 * kiwen-suwi pieces out of existence while still reporting a valid geometric
 * bounding box, so it looked fine to a getBBox() check and only showed up
 * visually.
 */
function namespaceIds(body, prefix) {
  const ids = [...body.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
  if (!ids.length) return body;

  let out = body;
  for (const id of new Set(ids)) {
    const scoped = `${prefix}-${id}`;
    const esc = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out
      .replace(new RegExp(`\\sid="${esc}"`, 'g'), ` id="${scoped}"`)
      // url(#id), url('#id'), url("#id")
      .replace(new RegExp(`url\\((['"]?)#${esc}\\1\\)`, 'g'), `url($1#${scoped}$1)`)
      // href="#id" and xlink:href="#id"
      .replace(new RegExp(`(xlink:)?href="#${esc}"`, 'g'), `$1href="#${scoped}"`);
  }
  return out;
}

/**
 * Reduces one upstream SVG to { viewBox, body } ready to become a <symbol>.
 */
function normalise(svg, { set, piece }) {
  const openMatch = /<svg\b[^>]*>/i.exec(svg);
  if (!openMatch) throw new Error(`${set}/${piece}: no <svg> element`);
  const openTag = openMatch[0];

  let viewBox = attr(openTag, 'viewBox');
  if (!viewBox) {
    // kiwen-suwi and cburnett ship width/height only. Without a viewBox the
    // symbol will not scale, so build one from the declared dimensions.
    const w = toNumber(attr(openTag, 'width'));
    const h = toNumber(attr(openTag, 'height'));
    if (!w || !h) throw new Error(`${set}/${piece}: no viewBox and no usable width/height`);
    viewBox = `0 0 ${w} ${h}`;
  }

  let body = svg.slice(openMatch.index + openTag.length);
  body = body.replace(/<\/svg\s*>[\s\S]*$/i, '');

  body = body
    .replace(/<\?xml[\s\S]*?\?>/gi, '')
    .replace(/<!DOCTYPE[\s\S]*?>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<metadata\b[\s\S]*?<\/metadata\s*>/gi, '')
    .replace(/<title\b[\s\S]*?<\/title\s*>/gi, '')
    .replace(/<desc\b[\s\S]*?<\/desc\s*>/gi, '')
    // Editor cruft that bloats the sprite and references dropped namespaces.
    .replace(/\s(?:sodipodi|inkscape):[\w-]+\s*=\s*"[^"]*"/gi, '')
    .replace(/<(?:sodipodi|inkscape):[\s\S]*?\/>/gi, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/>\s+</g, '><')
    .trim();

  body = inlineStyles(body, `${set}/${piece}`);
  body = namespaceIds(body, `${set}-${piece}`);

  // Any surviving bare reference would point outside this symbol.
  const dangling = [...body.matchAll(/url\(['"]?#([^)'"]+)['"]?\)/g)]
    .map((m) => m[1])
    .filter((ref) => !ref.startsWith(`${set}-${piece}-`));
  if (dangling.length) {
    throw new Error(`${set}/${piece}: unscoped references ${[...new Set(dangling)].join(', ')}`);
  }

  // Belt and braces: once every set shares one sprite document, a surviving
  // <style> rule or class would restyle other sets. inlineStyles should have
  // removed both — fail loudly if anything slipped through.
  if (/<style\b/i.test(body)) throw new Error(`${set}/${piece}: <style> survived inlining`);
  if (/\sclass\s*=/i.test(body)) throw new Error(`${set}/${piece}: class= survived inlining`);

  if (!body) throw new Error(`${set}/${piece}: empty after cleaning`);
  return { viewBox, body };
}

async function buildSet(set) {
  const symbols = [];
  let bytes = 0;

  for (const colour of COLOURS) {
    for (const type of TYPES) {
      const url = set.url(colour, type);
      const svg = await fetchText(url);
      bytes += svg.length;
      const { viewBox, body } = normalise(svg, { set: set.id, piece: `${colour}${type}` });
      symbols.push(`<symbol id="${set.id}-${colour}${type}" viewBox="${viewBox}">${body}</symbol>`);
    }
  }

  if (symbols.length !== 12) throw new Error(`${set.id}: expected 12 pieces, got ${symbols.length}`);
  process.stderr.write(
    `  ${set.name.padEnd(14)} 12 pieces  ${String(Math.round(bytes / 1024)).padStart(3)} KB in  ${set.licence}\n`
  );
  return symbols;
}

async function main() {
  process.stderr.write(`Building piece sprite from ${SETS.length} sets\n`);

  const all = [];
  for (const set of SETS) all.push(...(await buildSet(set)));

  const header =
    '<!-- Generated by tools/fetch-pieces.mjs. Do not edit by hand.\n' +
    '     Attribution and licences: assets/pieces/CREDITS.md -->';
  const sprite =
    `${header}\n<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" ` +
    `style="position:absolute;width:0;height:0;overflow:hidden" aria-hidden="true">` +
    all.join('') +
    `</svg>\n`;

  await fs.mkdir(path.join(ROOT, 'assets', 'pieces'), { recursive: true });
  await fs.writeFile(path.join(ROOT, 'assets/pieces.svg'), sprite);

  const credits = [
    '# Chess piece artwork',
    '',
    'Pocket Chess bundles several piece sets. Each is listed below with its',
    'author, licence and source. The CC BY 4.0 sets require attribution, which',
    'is also shown in the app under Settings → Pieces.',
    '',
    'The "Pocket" set is not listed here: it was drawn for this project and is',
    'covered by the project licence.',
    '',
    ...SETS.flatMap((s) => [
      `## ${s.name}`,
      '',
      `- **Author**: ${s.author}`,
      `- **Licence**: ${s.licence}`,
      `- **Source**: ${s.source}`,
      ...(s.notice ? [`- **Note**: ${s.notice}`] : []),
      '',
    ]),
  ].join('\n');
  await fs.writeFile(path.join(ROOT, 'assets/pieces/CREDITS.md'), credits);

  const size = (await fs.stat(path.join(ROOT, 'assets/pieces.svg'))).size;
  process.stderr.write(
    `\nWrote assets/pieces.svg — ${all.length} symbols, ${(size / 1024).toFixed(0)} KB\n` +
    `Wrote assets/pieces/CREDITS.md\n`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
