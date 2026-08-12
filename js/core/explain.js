/**
 * Turns Lichess theme tags into an explanation of the tactic just solved.
 *
 * This is the feature that separates solving from learning. The reference app
 * tells you "correct" and moves on; naming the motif and saying *why* it works
 * is what makes the pattern stick and transfer to a real game.
 *
 * Themes are ordered most-specific first: a puzzle tagged both `mateIn2` and
 * `smotheredMate` should headline the smothered mate, because that is the
 * pattern worth remembering.
 */

export const THEMES = {
  // --- named mating patterns (most specific) -------------------------------
  smotheredMate: {
    name: 'Smothered mate',
    blurb: 'A knight mates a king that is hemmed in entirely by its own pieces. The classic build-up sacrifices a queen to force the king’s own rook or pawn into the last escape square.',
  },
  anastasiaMate: {
    name: "Anastasia's mate",
    blurb: 'A knight and a rook trap the king against the edge — the knight covers the flight squares while the rook delivers mate along the file or rank.',
  },
  arabianMate: {
    name: 'Arabian mate',
    blurb: 'Rook and knight together in the corner. The knight guards the rook and takes away the escape squares, so the rook can sit right next to the king.',
  },
  bodenMate: {
    name: "Boden's mate",
    blurb: 'Two bishops on crossing diagonals mate a castled king, usually after the queenside pawns have been pried open by a sacrifice.',
  },
  dovetailMate: {
    name: 'Dovetail mate',
    blurb: 'The queen mates from an adjacent square while the king’s only two flight squares are blocked by its own pieces.',
  },
  hookMate: {
    name: 'Hook mate',
    blurb: 'Rook, knight and pawn interlock: the rook mates, the knight defends the rook, and the pawn covers the last escape square.',
  },
  doubleBishopMate: {
    name: 'Double bishop mate',
    blurb: 'Two bishops on parallel diagonals catch a king on the edge — one bishop mates, the other seals the escape.',
  },
  backRankMate: {
    name: 'Back-rank mate',
    blurb: 'The king is trapped behind its own unmoved pawns. A rook or queen arriving on the back rank mates because there is no luft — no escape square.',
  },

  // --- forcing motifs ------------------------------------------------------
  doubleCheck: {
    name: 'Double check',
    blurb: 'Two pieces give check at once, so blocking and capturing are both useless — the king *must* move. The most forcing move in chess.',
  },
  discoveredAttack: {
    name: 'Discovered attack',
    blurb: 'Moving one piece unveils an attack from the piece behind it. The mover is free to do damage of its own, because the opponent must answer the discovered threat.',
  },
  fork: {
    name: 'Fork',
    blurb: 'One piece attacks two targets at once. Only one can be saved, so the other falls. Knights fork best — no other piece can be attacked by one without attacking back.',
  },
  pin: {
    name: 'Pin',
    blurb: 'A piece cannot move without exposing something more valuable behind it. Pile more attackers onto a pinned piece — it cannot run.',
  },
  skewer: {
    name: 'Skewer',
    blurb: 'A pin in reverse: the valuable piece is in front. When it steps aside, the piece behind it is captured.',
  },
  deflection: {
    name: 'Deflection',
    blurb: 'A defender is dragged away from the job it was doing. Once it has been forced to move, whatever it was guarding hangs.',
  },
  attraction: {
    name: 'Attraction',
    blurb: 'A piece — usually the king — is lured onto a square where it can be forked, checked or mated. Often paid for with a sacrifice.',
  },
  interference: {
    name: 'Interference',
    blurb: 'A piece is planted between a defender and what it defends, cutting the line. The defence collapses even though the defender never moved.',
  },
  clearance: {
    name: 'Clearance',
    blurb: 'Your own piece is in the way. Move it — usually with tempo — to open the line or square your real threat needs.',
  },
  capturingDefender: {
    name: 'Capturing the defender',
    blurb: 'Remove the guard. Take the piece that was holding the defence together and the target behind it becomes free.',
  },
  xRayAttack: {
    name: 'X-ray',
    blurb: 'A long-range piece exerts pressure *through* another piece. When the blocker moves, the attack is already there.',
  },
  trappedPiece: {
    name: 'Trapped piece',
    blurb: 'A piece has run out of squares. Attack it with something it cannot capture or escape from, and it is simply lost.',
  },
  intermezzo: {
    name: 'In-between move',
    blurb: 'Before making the "obvious" recapture, insert a more forcing move. The opponent must answer it, and you recapture afterwards on better terms.',
  },
  sacrifice: {
    name: 'Sacrifice',
    blurb: 'Material is given up for something worth more than material — an exposed king, a decisive tempo, or mate.',
  },
  quietMove: {
    name: 'Quiet move',
    blurb: 'No check, no capture, no threat of its own — and completely winning. Quiet moves are the hardest to find because they do not announce themselves.',
  },
  zugzwang: {
    name: 'Zugzwang',
    blurb: 'The opponent would be fine if they could pass. Every legal move worsens their position — the obligation to move *is* the weapon.',
  },
  defensiveMove: {
    name: 'Defensive resource',
    blurb: 'The position looks lost until one precise move holds it. Finding these is what saves half points.',
  },
  hangingPiece: {
    name: 'Hanging piece',
    blurb: 'Something is simply undefended. The hardest part is noticing — scan for loose pieces before calculating anything deep.',
  },
  advancedPawn: {
    name: 'Advanced pawn',
    blurb: 'A pawn near promotion is worth far more than a pawn. The threat to queen outweighs ordinary material counting.',
  },
  promotion: {
    name: 'Promotion',
    blurb: 'Push it through. The threat of a new queen usually wins material even when the pawn never actually promotes.',
  },
  underPromotion: {
    name: 'Underpromotion',
    blurb: 'A queen is not always right. A knight gives check where a queen cannot, and a rook avoids stalemate — promote to what the position needs.',
  },
  exposedKing: {
    name: 'Exposed king',
    blurb: 'The king has lost its cover. Bring pieces toward it with threats — an exposed king turns ordinary moves into forcing ones.',
  },
  kingsideAttack: {
    name: 'Kingside attack',
    blurb: 'Pressure against the castled king. Open a file or a diagonal toward h7/h2 and add attackers faster than the defence can arrive.',
  },
  queensideAttack: {
    name: 'Queenside attack',
    blurb: 'The same idea on the other wing, where the king is often less protected than it looks.',
  },
};

/** Most-specific-first. The first match becomes the headline. */
const PRIORITY = [
  'smotheredMate', 'anastasiaMate', 'arabianMate', 'bodenMate', 'dovetailMate',
  'hookMate', 'doubleBishopMate', 'backRankMate',
  'doubleCheck', 'discoveredAttack', 'fork', 'pin', 'skewer', 'deflection',
  'attraction', 'interference', 'clearance', 'capturingDefender', 'xRayAttack',
  'trappedPiece', 'intermezzo', 'underPromotion', 'zugzwang', 'quietMove',
  'sacrifice', 'promotion', 'advancedPawn', 'hangingPiece', 'defensiveMove',
  'exposedKing', 'kingsideAttack', 'queensideAttack',
];

/** Human label for a theme tag, falling back to a de-camel-cased version. */
export function themeName(tag) {
  if (THEMES[tag]) return THEMES[tag].name;
  const m = /^mateIn(\d)$/.exec(tag);
  if (m) return `Mate in ${m[1]}`;
  return tag.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());
}

/**
 * Explanation for a solved puzzle.
 * @returns {{title:string, body:string, tags:string[]}}
 */
export function explain(themes = []) {
  const tags = themes.filter(Boolean);
  const headline = PRIORITY.find((t) => tags.includes(t));

  const mateTag = tags.find((t) => /^mateIn\d$/.test(t));
  const mateIn = mateTag ? Number(mateTag.slice(6)) : null;

  if (headline) {
    const entry = THEMES[headline];
    return {
      title: entry.name,
      body: entry.blurb,
      tags: tags.filter((t) => THEMES[t] || /^mateIn\d$/.test(t)),
    };
  }

  if (mateIn) {
    return {
      title: `Mate in ${mateIn}`,
      body: mateIn === 1
        ? 'A single forcing move ends it. Look for checks first — most one-movers are a check the king cannot answer.'
        : `A forced sequence of ${mateIn} moves. Every opponent reply is covered, which is what makes it forced rather than merely strong.`,
      tags,
    };
  }

  return {
    title: 'Solved',
    body: 'Material won by force. Check the loose pieces and the forcing moves first — that is where most tactics live.',
    tags,
  };
}

/** Themes worth offering as drills, in the order they should be listed. */
export function drillOrder(available = {}) {
  return PRIORITY.filter((t) => available[t]);
}
