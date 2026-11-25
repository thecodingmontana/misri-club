/**
 * Famous games to replay and learn from. The moves are checked against
 * chessgames.com (see `source`) and replayed by a test, so an illegal or
 * mistyped move cannot ship; the notes are the app's own.
 */

export type Tag =
  | 'sacrifice'
  | 'queen sacrifice'
  | 'king hunt'
  | 'attack'
  | 'miniature'

export interface Note {
  /** The move it explains, as written in the game: `18. Bd6`, `17... Be6`. */
  move: string
  text: string
  /** A "!!" move: the best move, found against the odds, often a sacrifice. */
  brilliant?: boolean
}

export interface MasterGame {
  slug: string
  title: string
  white: string
  black: string
  event: string
  year: number
  result: '1-0' | '0-1' | '1/2-1/2'
  opening: string
  description: string
  tags: Array<Tag>
  moves: string
  notes: Array<Note>
  source: string
}

export const MASTER_GAMES: Array<MasterGame> = [
  {
    slug: 'anderssen-kieseritzky-1851',
    title: 'The Immortal Game',
    white: 'Adolf Anderssen',
    black: 'Lionel Kieseritzky',
    event: 'London',
    year: 1851,
    result: '1-0',
    opening: "King's Gambit Accepted: Bishop's Gambit",
    description:
      'Anderssen gives up a bishop, both rooks and his queen, then mates with his three remaining minor pieces.',
    tags: ['sacrifice', 'queen sacrifice', 'attack'],
    moves:
      '1. e4 e5 2. f4 exf4 3. Bc4 Qh4+ 4. Kf1 b5 5. Bxb5 Nf6 6. Nf3 Qh6 7. d3 Nh5 8. Nh4 Qg5 9. Nf5 c6 10. g4 Nf6 11. Rg1 cxb5 12. h4 Qg6 13. h5 Qg5 14. Qf3 Ng8 15. Bxf4 Qf6 16. Nc3 Bc5 17. Nd5 Qxb2 18. Bd6 Bxg1 19. e5 Qxa1+ 20. Ke2 Na6 21. Nxg7+ Kd8 22. Qf6+ Nxf6 23. Be7#',
    notes: [
      {
        move: '3... Qh4+',
        text: 'Black checks at once. The white king has to walk to f1 and can no longer castle, but White gains time by attacking the queen later.',
      },
      {
        move: '11. Rg1',
        text: 'Anderssen leaves the bishop on b5 to be taken. Every tempo goes into chasing the black queen and developing for the attack.',
      },
      {
        move: '17. Nd5',
        text: 'The knight lands on d5 and ignores the queen raid on b2. Anderssen is ready to give up both rooks.',
      },
      {
        move: '18. Bd6',
        text: 'The heart of the game. The quiet bishop move cuts the black queen off from the defence and covers the escape squares around the king, so White can let both rooks go.',
        brilliant: true,
      },
      {
        move: '22. Qf6+',
        text: 'A queen sacrifice. Taking it pulls the knight to f6, and the last defender of e7 is gone.',
        brilliant: true,
      },
      {
        move: '23. Be7#',
        text: 'Mate by a bishop and two knights. White finished the game a queen, two rooks and a bishop down.',
      },
    ],
    source: 'https://www.chessgames.com/perl/chessgame?gid=1018910',
  },
  {
    slug: 'anderssen-dufresne-1852',
    title: 'The Evergreen Game',
    white: 'Adolf Anderssen',
    black: 'Jean Dufresne',
    event: 'Berlin',
    year: 1852,
    result: '1-0',
    opening: 'Evans Gambit',
    description:
      'A gambit, a quiet rook move while a knight hangs, and a queen sacrifice that ends in mate.',
    tags: ['sacrifice', 'queen sacrifice', 'attack'],
    moves:
      '1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. b4 Bxb4 5. c3 Ba5 6. d4 exd4 7. O-O d3 8. Qb3 Qf6 9. e5 Qg6 10. Re1 Nge7 11. Ba3 b5 12. Qxb5 Rb8 13. Qa4 Bb6 14. Nbd2 Bb7 15. Ne4 Qf5 16. Bxd3 Qh5 17. Nf6+ gxf6 18. exf6 Rg8 19. Rad1 Qxf3 20. Rxe7+ Nxe7 21. Qxd7+ Kxd7 22. Bf5+ Ke8 23. Bd7+ Kf8 24. Bxe7#',
    notes: [
      {
        move: '4. b4',
        text: 'The Evans Gambit. White gives a pawn to gain time and build a big centre with c3 and d4.',
      },
      {
        move: '17. Nf6+',
        text: 'A knight sacrifice to open lines towards the black king, which is still stuck in the centre.',
      },
      {
        move: '19. Rad1',
        text: 'The famous quiet move. Instead of saving the knight on f3, Anderssen brings his last piece into the attack and lets Black take it.',
        brilliant: true,
      },
      {
        move: '21. Qxd7+',
        text: 'A queen sacrifice that drags the king to d7, where the bishops finish the job.',
        brilliant: true,
      },
      {
        move: '24. Bxe7#',
        text: 'Mate. The d-file rook that came in on move 19 covers the escape squares.',
      },
    ],
    // chessgames.com stops at 20...Nxe7 (the 1852 report said "mates in 4").
    source: 'https://en.wikipedia.org/wiki/Evergreen_Game',
  },
  {
    slug: 'morphy-duke-isouard-1858',
    title: 'The Opera Game',
    white: 'Paul Morphy',
    black: 'Duke Karl and Count Isouard',
    event: 'Paris Opera',
    year: 1858,
    result: '1-0',
    opening: 'Philidor Defense',
    description:
      'The model lesson in development: every Morphy move gains time until a queen sacrifice ends it.',
    tags: ['sacrifice', 'queen sacrifice', 'miniature'],
    moves:
      '1. e4 e5 2. Nf3 d6 3. d4 Bg4 4. dxe5 Bxf3 5. Qxf3 dxe5 6. Bc4 Nf6 7. Qb3 Qe7 8. Nc3 c6 9. Bg5 b5 10. Nxb5 cxb5 11. Bxb5+ Nbd7 12. O-O-O Rd8 13. Rxd7 Rxd7 14. Rd1 Qe6 15. Bxd7+ Nxd7 16. Qb8+ Nxb8 17. Rd8#',
    notes: [
      {
        move: '3... Bg4',
        text: 'The pin costs Black the bishop pair after dxe5, and leaves Black behind in development.',
      },
      {
        move: '7. Qb3',
        text: 'A double attack on f7 and b7. Morphy develops with threats, which is the theme of the whole game.',
      },
      {
        move: '10. Nxb5',
        text: 'A knight sacrifice to keep the initiative and open lines against the uncastled king.',
      },
      {
        move: '13. Rxd7',
        text: 'Morphy gives back the exchange to remove a defender, keeping the pin on d7.',
      },
      {
        move: '16. Qb8+',
        text: 'A queen sacrifice to pull the knight away from d7.',
        brilliant: true,
      },
      {
        move: '17. Rd8#',
        text: 'The "Opera mate": a rook on the back rank, covered by the bishop on g5.',
      },
    ],
    source: 'https://www.chessgames.com/perl/chessgame?gid=1233404',
  },
  {
    slug: 'byrne-fischer-1956',
    title: 'The Game of the Century',
    white: 'Donald Byrne',
    black: 'Bobby Fischer',
    event: 'Rosenwald Trophy, New York',
    year: 1956,
    result: '0-1',
    opening: 'Grünfeld Defense',
    description:
      'Thirteen-year-old Fischer gives up his queen and wins it all back with a windmill of discovered checks.',
    tags: ['sacrifice', 'queen sacrifice', 'attack'],
    moves:
      '1. Nf3 Nf6 2. c4 g6 3. Nc3 Bg7 4. d4 O-O 5. Bf4 d5 6. Qb3 dxc4 7. Qxc4 c6 8. e4 Nbd7 9. Rd1 Nb6 10. Qc5 Bg4 11. Bg5 Na4 12. Qa3 Nxc3 13. bxc3 Nxe4 14. Bxe7 Qb6 15. Bc4 Nxc3 16. Bc5 Rfe8+ 17. Kf1 Be6 18. Bxb6 Bxc4+ 19. Kg1 Ne2+ 20. Kf1 Nxd4+ 21. Kg1 Ne2+ 22. Kf1 Nc3+ 23. Kg1 axb6 24. Qb4 Ra4 25. Qxb6 Nxd1 26. h3 Rxa2 27. Kh2 Nxf2 28. Re1 Rxe1 29. Qd8+ Bf8 30. Nxe1 Bd5 31. Nf3 Ne4 32. Qb8 b5 33. h4 h5 34. Ne5 Kg7 35. Kg1 Bc5+ 36. Kf1 Ng3+ 37. Ke1 Bb4+ 38. Kd1 Bb3+ 39. Kc1 Ne2+ 40. Kb1 Nc3+ 41. Kc1 Rc2#',
    notes: [
      {
        move: '11. Bg5',
        text: 'White keeps the king in the centre one move too long. Developing with Be2 and castling was safer.',
      },
      {
        move: '11... Na4',
        text: 'The knight goes where it can be taken. Taking it loses e4, and the e-file opens towards the uncastled king.',
        brilliant: true,
      },
      {
        move: '17... Be6',
        text: 'The move of the century. Fischer lets his queen go and starts a windmill of discovered checks that wins far more than a queen.',
        brilliant: true,
      },
      {
        move: '25... Nxd1',
        text: 'Count the material: rook, two bishops and pawns for the queen. The black pieces now work together and outnumber it.',
      },
      {
        move: '41... Rc2#',
        text: 'Mate by rook, bishop and knight together, the extra pieces doing exactly what they promised.',
      },
    ],
    source: 'https://www.chessgames.com/perl/chessgame?gid=1008361',
  },
  {
    slug: 'kasparov-topalov-1999',
    title: "Kasparov's Immortal",
    white: 'Garry Kasparov',
    black: 'Veselin Topalov',
    event: 'Hoogovens, Wijk aan Zee',
    year: 1999,
    result: '1-0',
    opening: 'Pirc Defense',
    description:
      'A rook sacrifice drags the black king across the whole board, calculated many moves deep.',
    tags: ['sacrifice', 'king hunt', 'attack'],
    moves:
      '1. e4 d6 2. d4 Nf6 3. Nc3 g6 4. Be3 Bg7 5. Qd2 c6 6. f3 b5 7. Nge2 Nbd7 8. Bh6 Bxh6 9. Qxh6 Bb7 10. a3 e5 11. O-O-O Qe7 12. Kb1 a6 13. Nc1 O-O-O 14. Nb3 exd4 15. Rxd4 c5 16. Rd1 Nb6 17. g3 Kb8 18. Na5 Ba8 19. Bh3 d5 20. Qf4+ Ka7 21. Rhe1 d4 22. Nd5 Nbxd5 23. exd5 Qd6 24. Rxd4 cxd4 25. Re7+ Kb6 26. Qxd4+ Kxa5 27. b4+ Ka4 28. Qc3 Qxd5 29. Ra7 Bb7 30. Rxb7 Qc4 31. Qxf6 Kxa3 32. Qxa6+ Kxb4 33. c3+ Kxc3 34. Qa1+ Kd2 35. Qb2+ Kd1 36. Bf1 Rd2 37. Rd7 Rxd7 38. Bxc4 bxc4 39. Qxh8 Rd3 40. Qa8 c3 41. Qa4+ Ke1 42. f4 f5 43. Kc1 Rd2 44. Qa7',
    notes: [
      {
        move: '24. Rxd4',
        text: 'The famous rook sacrifice. Kasparov gives a rook to break open the black king and calculated the hunt that follows far ahead.',
        brilliant: true,
      },
      {
        move: '25. Re7+',
        text: 'The second rook joins with check, and the black king has to come forward towards the white pawns.',
      },
      {
        move: '27. b4+',
        text: 'The pawns become attackers: the king is driven up the board, away from its own army.',
      },
      {
        move: '37. Rd7',
        text: 'After the hunt White trades into a winning position, a piece and the safer king ahead.',
      },
      {
        move: '44. Qa7',
        text: 'Topalov resigned. The black king is stranded on e1 and White wins more material.',
      },
    ],
    source: 'https://www.chessgames.com/perl/chessgame?gid=1011478',
  },
  {
    slug: 'levitsky-marshall-1912',
    title: 'The Gold Coin Game',
    white: 'Stefan Levitsky',
    black: 'Frank Marshall',
    event: 'Breslau',
    year: 1912,
    result: '0-1',
    opening: 'French Defense: Tarrasch, Marshall Gambit',
    description:
      'One of the most famous final moves ever: a queen that can be taken three ways, and every capture loses.',
    tags: ['sacrifice', 'queen sacrifice', 'attack'],
    moves:
      '1. d4 e6 2. e4 d5 3. Nc3 c5 4. Nf3 Nc6 5. exd5 exd5 6. Be2 Nf6 7. O-O Be7 8. Bg5 O-O 9. dxc5 Be6 10. Nd4 Bxc5 11. Nxe6 fxe6 12. Bg4 Qd6 13. Bh3 Rae8 14. Qd2 Bb4 15. Bxf6 Rxf6 16. Rad1 Qc5 17. Qe2 Bxc3 18. bxc3 Qxc3 19. Rxd5 Nd4 20. Qh5 Ref8 21. Re5 Rh6 22. Qg5 Rxh3 23. Rc5 Qg3',
    notes: [
      {
        move: '19... Nd4',
        text: 'Marshall gives up the d5 pawn to bring the knight closer to the white king.',
      },
      {
        move: '22... Rxh3',
        text: 'The rook takes the bishop that guarded the light squares around the king.',
      },
      {
        move: '23... Qg3',
        text: 'The queen can be taken three ways and each loses: hxg3 Ne2 is mate, fxg3 Ne2+ Kh1 Rxf1 is mate, and Qxg3 Ne2+ leaves Black a piece up. White resigned.',
        brilliant: true,
      },
    ],
    source: 'https://www.chessgames.com/perl/chessgame?gid=1094915',
  },
  {
    slug: 'rotlewi-rubinstein-1907',
    title: "Rubinstein's Immortal",
    white: 'Georg Rotlewi',
    black: 'Akiba Rubinstein',
    event: 'Lodz',
    year: 1907,
    result: '0-1',
    opening: "Queen's Gambit Declined: Tarrasch Defense",
    description:
      'Two bishops aimed at the white king, a queen offered and both rooks thrown in after it.',
    tags: ['sacrifice', 'queen sacrifice', 'attack'],
    moves:
      '1. d4 d5 2. Nf3 e6 3. e3 c5 4. c4 Nc6 5. Nc3 Nf6 6. dxc5 Bxc5 7. a3 a6 8. b4 Bd6 9. Bb2 O-O 10. Qd2 Qe7 11. Bd3 dxc4 12. Bxc4 b5 13. Bd3 Rd8 14. Qe2 Bb7 15. O-O Ne5 16. Nxe5 Bxe5 17. f4 Bc7 18. e4 Rac8 19. e5 Bb6+ 20. Kh1 Ng4 21. Be4 Qh4 22. g3 Rxc3 23. gxh4 Rd2 24. Qxd2 Bxe4+ 25. Qg2 Rh3',
    notes: [
      {
        move: '20... Ng4',
        text: 'With both bishops raking the long diagonals, the knight and queen head for h2.',
      },
      {
        move: '22... Rxc3',
        text: 'Rubinstein leaves his queen to be taken. If White accepts, the bishops and rooks break through to the king.',
        brilliant: true,
      },
      {
        move: '23... Rd2',
        text: 'The second rook joins the sacrifice, deflecting the white queen from the long diagonal.',
        brilliant: true,
      },
      {
        move: '25... Rh3',
        text: 'White resigned: mate on h2 cannot be stopped.',
      },
    ],
    source: 'https://en.wikipedia.org/wiki/Rotlewi_versus_Rubinstein',
  },
  {
    slug: 'lasker-thomas-1912',
    title: 'The King Hunt',
    white: 'Edward Lasker',
    black: 'George Alan Thomas',
    event: 'London',
    year: 1912,
    result: '1-0',
    opening: 'Dutch Defense',
    description:
      'A queen sacrifice on h7 and a king marched from g8 all the way to g1 with checks.',
    tags: ['queen sacrifice', 'king hunt', 'miniature'],
    moves:
      '1. d4 e6 2. Nf3 f5 3. Nc3 Nf6 4. Bg5 Be7 5. Bxf6 Bxf6 6. e4 fxe4 7. Nxe4 b6 8. Ne5 O-O 9. Bd3 Bb7 10. Qh5 Qe7 11. Qxh7+ Kxh7 12. Nxf6+ Kh6 13. Neg4+ Kg5 14. h4+ Kf4 15. g3+ Kf3 16. Be2+ Kg2 17. Rh2+ Kg1 18. Kd2#',
    notes: [
      {
        move: '11. Qxh7+',
        text: 'A queen sacrifice that pulls the king out of its shelter. Every move from here is a check.',
        brilliant: true,
      },
      {
        move: '14. h4+',
        text: 'The pawns join the chase. The king is driven up the board towards the white back rank.',
      },
      {
        move: '18. Kd2#',
        text: 'Mate by moving the king, which uncovers the rook on a1. Lasker said he preferred moving one piece to castling.',
      },
    ],
    source: 'https://www.chessgames.com/perl/chessgame?gid=1259009',
  },
  {
    slug: 'reti-tartakower-1910',
    title: 'The Double-Check Mate',
    white: 'Richard Réti',
    black: 'Savielly Tartakower',
    event: 'Vienna',
    year: 1910,
    result: '1-0',
    opening: 'Caro-Kann Defense',
    description:
      'An eleven-move miniature: a queen sacrifice and the most famous double check in chess.',
    tags: ['queen sacrifice', 'miniature'],
    moves:
      '1. e4 c6 2. d4 d5 3. Nc3 dxe4 4. Nxe4 Nf6 5. Qd3 e5 6. dxe5 Qa5+ 7. Bd2 Qxe5 8. O-O-O Nxe4 9. Qd8+ Kxd8 10. Bg5+ Kc7 11. Bd8#',
    notes: [
      {
        move: '8... Nxe4',
        text: 'Black grabs the knight, not seeing that the queen and the rook on d1 line up against the king.',
      },
      {
        move: '9. Qd8+',
        text: 'A queen sacrifice. Taking it puts the king on d8, where it meets a double check.',
        brilliant: true,
      },
      {
        move: '10. Bg5+',
        text: 'Double check from bishop and rook: only the king can move, and every square loses.',
      },
      {
        move: '11. Bd8#',
        text: 'Mate. Had the king gone to e8 instead, Rd8 would have mated.',
      },
    ],
    source: 'https://www.chessgames.com/perl/chessgame?gid=1250654',
  },
]

export function masterGame(slug: string) {
  return MASTER_GAMES.find((game) => game.slug === slug)
}

/** The ply (1 = White's first move) a note label like `17... Be6` refers to. */
export function plyOf(move: string): { ply: number; san: string } {
  const match = /^(\d+)(\.\.\.|\.)\s*(\S+)$/.exec(move)
  if (!match) throw new Error(`Unreadable note label: ${move}`)
  const ply = (Number(match[1]) - 1) * 2 + (match[2] === '...' ? 2 : 1)
  return { ply, san: match[3] }
}
