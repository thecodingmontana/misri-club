/**
 * Opening courses. Each line comes from the Lichess opening data set
 * (github.com/lichess-org/chess-openings, CC0), bundled whole as
 * `public/openings.tsv`; a test checks every course's name and moves against
 * it. The reason given for each move is the app's own.
 */

export interface OpeningCourse {
  slug: string
  /** The Lichess name of the deepest named position the line reaches. */
  name: string
  eco: string
  /** The side the course teaches you to play. */
  side: 'white' | 'black'
  summary: string
  moves: string
  /** Why each move is played, one entry per move of `moves`. */
  why: Array<string>
  /** What to aim for once the line is over. */
  plans: Array<string>
}

export const OPENINGS: Array<OpeningCourse> = [
  {
    slug: 'italian-game',
    name: 'Italian Game: Classical Variation, Giuoco Pianissimo',
    eco: 'C54',
    side: 'white',
    summary:
      'The first opening most players learn: quick development, the bishop aimed at f7, and a slow build-up in the centre.',
    moves: '1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. c3 Nf6 5. d3',
    why: [
      'Takes the centre and opens lines for the queen and the light-squared bishop.',
      'Black claims an equal share of the centre.',
      'Develops with tempo by attacking the e5 pawn.',
      'Defends e5 and develops a piece.',
      'The Italian bishop: aimed at f7, the weakest square next to the black king.',
      'Black mirrors, pointing the bishop at f2.',
      'Prepares d4 to take over the centre, and gives the bishop a retreat on c2 later.',
      'Develops and hits e4 at once.',
      'The quiet "very slow game": keeps e4 solid and saves d4 for later.',
    ],
    plans: [
      'Castle, then play Nbd2–f1–g3 to bring the last knight towards the king side.',
      'Look for d3–d4 at the right moment to grab the centre.',
      'Keep the light-squared bishop alive; Black often offers ...Na5 to trade it.',
    ],
  },
  {
    slug: 'ruy-lopez',
    name: 'Ruy Lopez: Closed',
    eco: 'C90',
    side: 'white',
    summary:
      'The Spanish Game: lasting pressure on e5 through the c6 knight, the main battleground of classical chess.',
    moves:
      '1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 6. Re1 b5 7. Bb3 d6 8. c3 O-O',
    why: [
      'Takes the centre and frees the bishop and queen.',
      'Black takes an equal share of the centre.',
      'Develops and attacks e5.',
      'Defends e5.',
      'Pins down the knight that defends e5: the idea of the Ruy Lopez.',
      'The Morphy Defence: asks the bishop what it wants at once.',
      'Keeps the pin alive instead of trading on c6.',
      'Develops and counter-attacks e4.',
      'King to safety first; e4 is guarded tactically.',
      'Quiet development, getting ready to castle.',
      'Defends e4 so the threat on e5 becomes real.',
      'Gains space and finally breaks the pin on the c6 knight.',
      'The bishop keeps its diagonal towards f7 from b3.',
      'Solidly defends e5.',
      'Prepares d4 and gives the bishop the c2 retreat.',
      'Black is fully developed and castled.',
    ],
    plans: [
      'Play h3 and d4 to build the big centre; the knight goes Nbd2–f1–g3.',
      'Black usually answers with ...Na5 and ...c5 to fight for d4.',
      'Long manoeuvring games: patience matters more than tricks.',
    ],
  },
  {
    slug: 'scotch-game',
    name: 'Scotch Game',
    eco: 'C45',
    side: 'white',
    summary:
      'Open the centre at once with d4: direct, active play and fewer long theory lines than the Ruy Lopez.',
    moves: '1. e4 e5 2. Nf3 Nc6 3. d4 exd4 4. Nxd4',
    why: [
      'Takes the centre.',
      'Black matches it.',
      'Develops and attacks e5.',
      'Defends e5.',
      'Strikes the centre immediately instead of developing the bishop first.',
      'Black takes, since e5 was under fire.',
      'Recaptures with a piece in the centre and keeps the e4 pawn.',
    ],
    plans: [
      'Develop fast with Nc3, Be3 and Bc4 or Be2, then castle.',
      'If Black plays ...Nxd4, take back with the queen: it is safe in the centre this early.',
      'Use the half-open d-file and the space on e4.',
    ],
  },
  {
    slug: 'queens-gambit-declined',
    name: "Queen's Gambit Declined",
    eco: 'D53',
    side: 'white',
    summary:
      "The Queen's Gambit: offer the c-pawn to pull Black's d5 pawn away from the centre. Here Black declines and holds firm.",
    moves: '1. d4 d5 2. c4 e6 3. Nc3 Nf6 4. Bg5 Be7 5. e3 O-O 6. Nf3',
    why: [
      'Takes the centre and frees the dark-squared bishop.',
      'Black blocks the d-pawn and claims the centre too.',
      'The gambit: if Black takes, White wins back the pawn and the centre with e4.',
      'Black declines and keeps a strong pawn on d5.',
      'Adds pressure on d5.',
      'Develops and defends d5.',
      'Pins the f6 knight to the queen, more pressure on d5.',
      'Breaks the pin and prepares to castle.',
      'Opens the light-squared bishop and keeps d4 solid.',
      'King safety first.',
      'Natural development; White is ready to castle too.',
    ],
    plans: [
      'Rc1 and the minority attack (b4–b5) against Black’s queen-side pawns.',
      'If Black ever takes on c4, recapture with the bishop and you have the freer game.',
      'Watch for Black’s ...c5 or ...e5 freeing breaks.',
    ],
  },
  {
    slug: 'queens-gambit-accepted',
    name: "Queen's Gambit Accepted: Classical Defense",
    eco: 'D26',
    side: 'black',
    summary:
      "Take the gambit pawn, give it back on your own terms, and hit White's centre with ...c5.",
    moves: '1. d4 d5 2. c4 dxc4 3. Nf3 Nf6 4. e3 e6 5. Bxc4 c5',
    why: [
      'White takes the centre.',
      'Black takes an equal share.',
      'The Queen’s Gambit.',
      'Black accepts. The pawn cannot really be kept, but taking it gives Black free development.',
      'Stops ...e5 and develops.',
      'Develops and keeps e4 under control.',
      'Prepares to take back the pawn on c4.',
      'Opens the f8 bishop and prepares ...c5.',
      'White wins the pawn back.',
      'The key move: strikes at d4 so White cannot keep a big centre for free.',
    ],
    plans: [
      'Develop with ...a6, ...b5 and ...Bb7, castle short.',
      'Trade on d4 at the right moment to leave White with an isolated pawn.',
      'An isolated d-pawn is a target: blockade it on d5 and attack it.',
    ],
  },
  {
    slug: 'london-system',
    name: "Queen's Pawn Game: London System",
    eco: 'D02',
    side: 'white',
    summary:
      'A system you can play against almost anything: d4, Bf4, e3, c3 and a solid pyramid of pawns.',
    moves: '1. d4 d5 2. Nf3 Nf6 3. Bf4 c5 4. e3 Nc6 5. Nbd2 e6 6. c3',
    why: [
      'Takes the centre.',
      'Black meets it.',
      'Develops and keeps e5 under control.',
      'Develops.',
      'The London bishop comes out before e3 locks it in.',
      'Black attacks the centre straight away.',
      'Supports d4 and opens the other bishop.',
      'More pressure on d4.',
      'Supports e4 and keeps c3 for the pawn.',
      'Black opens the bishop.',
      'The pawn pyramid: d4 is now rock solid.',
    ],
    plans: [
      'Bd3, castle, and a knight to e5 supported by Nd2–f3.',
      'Against ...Qb6 pressure on b2, Qb3 or Qc1 holds.',
      'The plan is the same in nearly every game: learn it once, play it for years.',
    ],
  },
  {
    slug: 'english-opening',
    name: "English Opening: King's English Variation, Four Knights Variation",
    eco: 'A28',
    side: 'white',
    summary:
      'Start on the wing with c4: a Sicilian with an extra move, flexible and positional.',
    moves: '1. c4 e5 2. Nc3 Nf6 3. Nf3 Nc6',
    why: [
      'Controls d5 from the side without committing the centre pawns.',
      'Black takes the centre the classical way.',
      'Adds control of d5 and e4.',
      'Develops and attacks e4.',
      'Develops and attacks e5.',
      'Defends e5; all four knights are out.',
    ],
    plans: [
      'Fianchetto with g3 and Bg2 to aim at the long diagonal.',
      'Play on the queen side with a3, b4 and Rb1.',
      'd4 at the right moment opens the centre in White’s favour.',
    ],
  },
  {
    slug: 'sicilian-najdorf',
    name: 'Sicilian Defense: Najdorf Variation',
    eco: 'B90',
    side: 'black',
    summary:
      'The most combative answer to 1.e4: unbalanced pawns, chances for both sides, and the favourite of Fischer and Kasparov.',
    moves: '1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6',
    why: [
      'White takes the centre.',
      'The Sicilian: fights for d4 from the side and unbalances the pawns.',
      'Develops and prepares d4.',
      'Controls e5 and opens the c8 bishop.',
      'White opens the centre.',
      'Trades a wing pawn for a centre pawn: Black gets two centre pawns to White’s one.',
      'Recaptures with the knight in the centre.',
      'Develops and attacks e4.',
      'Defends e4.',
      'The Najdorf move: keeps the white pieces off b5 and prepares ...e5 or ...b5.',
    ],
    plans: [
      'Play ...e5 or ...e6 and develop the king-side bishop.',
      'Counter-attack on the queen side with ...b5 and the half-open c-file.',
      'Sharp play: White often castles long and storms the king side, so speed matters.',
    ],
  },
  {
    slug: 'french-advance',
    name: 'French Defense: Advance Variation',
    eco: 'C02',
    side: 'black',
    summary:
      'A solid wall on e6 and d5, then strike at the base of White’s pawn chain with ...c5.',
    moves: '1. e4 e6 2. d4 d5 3. e5 c5 4. c3 Nc6',
    why: [
      'White takes the centre.',
      'The French: prepares ...d5 with full support.',
      'White builds the ideal centre.',
      'Challenges e4 at once.',
      'White gains space and locks the centre.',
      'Hits d4, the base of White’s pawn chain.',
      'Supports d4 with another pawn.',
      'Develops and adds a second attacker to d4.',
    ],
    plans: [
      'Pile up on d4 with ...Qb6, ...Nge7–f5 and ...cxd4.',
      'The light-squared bishop is the French problem piece: aim to trade it or free it with ...f6.',
      'If White keeps d4, a later ...f6 attacks the head of the chain on e5.',
    ],
  },
  {
    slug: 'caro-kann',
    name: 'Caro-Kann Defense: Classical Variation',
    eco: 'B18',
    side: 'black',
    summary:
      'Like the French but the light-squared bishop gets out first: solid, safe and hard to break.',
    moves: '1. e4 c6 2. d4 d5 3. Nd2 dxe4 4. Nxe4 Bf5',
    why: [
      'White takes the centre.',
      'Prepares ...d5 without blocking the c8 bishop.',
      'White builds the ideal centre.',
      'Challenges e4.',
      'Defends e4 with a piece.',
      'Black gives up the centre point to free the game.',
      'White recaptures and develops.',
      'The point of the Caro-Kann: the bishop comes out before ...e6 closes it in.',
    ],
    plans: [
      'Follow with ...e6, ...Nd7, ...Ngf6 and short or long castling.',
      'White often plays h4–h5 to harass the bishop: answer with ...h6 and keep it on g6.',
      'A sound pawn structure with no weaknesses: play for a good endgame.',
    ],
  },
  {
    slug: 'kings-indian',
    name: "King's Indian Defense: Orthodox Variation",
    eco: 'E92',
    side: 'black',
    summary:
      'Let White take the centre, castle quickly, then hit back with ...e5 and attack on the king side.',
    moves: '1. d4 Nf6 2. c4 g6 3. Nc3 Bg7 4. e4 d6 5. Nf3 O-O 6. Be2 e5',
    why: [
      'White takes the centre.',
      'Develops and stops e4 for now.',
      'Grabs more of the centre.',
      'Prepares the fianchetto.',
      'Develops and prepares e4.',
      'The bishop on the long diagonal will press against d4.',
      'White builds a big pawn centre.',
      'Keeps e5 for the pawn break.',
      'Develops.',
      'King safety first, before the fight.',
      'Develops and prepares to castle.',
      'The King’s Indian strike: hits d4 and claims dark squares.',
    ],
    plans: [
      'If White plays d5, attack the king side with ...Nh5 or ...Ne8 and ...f5.',
      'White attacks on the queen side with c5: it is a race, so do not hesitate.',
      'The g7 bishop wakes up once the centre opens.',
    ],
  },
  {
    slug: 'slav-defense',
    name: 'Slav Defense: Czech Variation',
    eco: 'D17',
    side: 'black',
    summary:
      'Hold d5 with ...c6 rather than ...e6, so the light-squared bishop gets out to f5.',
    moves: '1. d4 d5 2. c4 c6 3. Nf3 Nf6 4. Nc3 dxc4 5. a4 Bf5',
    why: [
      'White takes the centre.',
      'Black meets it.',
      'The Queen’s Gambit.',
      'Defends d5 without blocking the c8 bishop.',
      'Develops.',
      'Develops and defends d5.',
      'More pressure on d5.',
      'Takes the pawn now that ...b5 could hold it.',
      'Stops ...b5, so the pawn cannot be kept.',
      'The bishop comes out before ...e6, the point of the Slav.',
    ],
    plans: [
      'Continue with ...e6, ...Bb4 and castle.',
      'White wins the pawn back with e3 and Bxc4 or Ne5: develop rather than cling to it.',
      'A solid game with a good bishop; aim for an even, sound middlegame.',
    ],
  },
  {
    slug: 'scandinavian',
    name: 'Scandinavian Defense: Main Line',
    eco: 'B01',
    side: 'black',
    summary:
      'Challenge e4 on the very first move. Simple to learn, with clear plans.',
    moves: '1. e4 d5 2. exd5 Qxd5 3. Nc3 Qa5',
    why: [
      'White takes the centre.',
      'Hits e4 immediately.',
      'White takes.',
      'The queen recaptures. It will lose a tempo, but Black gets free play.',
      'Develops with tempo on the queen.',
      'The queen steps aside to a5, out of the way and pinning the knight against e1 later.',
    ],
    plans: [
      'Develop with ...Nf6, ...c6, ...Bf5 and ...e6, a solid "Caro-Kann" set-up.',
      'Keep the queen safe from Bd2 and Nd5 tricks.',
      'Castle short; the game is calm and positional.',
    ],
  },
]

export function opening(slug: string) {
  return OPENINGS.find((course) => course.slug === slug)
}

/** The Lichess page for an opening name, e.g. `Ruy_Lopez_Closed`. */
export function lichessOpeningUrl(name: string) {
  const key = name
    .replace(/['’.:,]/g, '')
    .trim()
    .replace(/\s+/g, '_')
  return `https://lichess.org/opening/${key}`
}

export interface NamedLine {
  eco: string
  name: string
  /** SAN moves of the named position. */
  moves: Array<string>
}

/** Parses the bundled data set: `eco<TAB>name<TAB>1. e4 e5 ...` per line. */
export function parseOpenings(tsv: string): Array<NamedLine> {
  return tsv
    .trim()
    .split('\n')
    .slice(1)
    .map((row) => {
      const [eco, name, pgn] = row.split('\t')
      return { eco, name, moves: sanOf(pgn) }
    })
}

/** `1. e4 e5 2. Nf3` → `['e4', 'e5', 'Nf3']` */
export function sanOf(pgn: string): Array<string> {
  return pgn.split(/\s+/).filter((token) => token && !/^\d+\.$/.test(token))
}

/** The deepest named position a sequence of moves passes through. */
export function deepestNamed(lines: Array<NamedLine>, moves: Array<string>) {
  let best: NamedLine | null = null
  for (const line of lines) {
    if (line.moves.length > moves.length) continue
    if (best && line.moves.length <= best.moves.length) continue
    if (line.moves.every((san, i) => san === moves[i])) best = line
  }
  return best
}
