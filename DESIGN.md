# Misri design direction

Written from what the app already is, so new screens match it. Treat it as the
direction for any UI work; `antislop` is the filter applied on top.

Dial: ENERGY 2 / RHYTHM 2 / MOTION 1

Reading this as: a club tool for chess players on their phones, in a warm
"chess club noticeboard" language, calm but with character.

## Identity

- **Motif: the cream board and green ink.** Every screen is a cream surface
  with deep-green text, like a club scoresheet. Cards are slightly darker cream
  tiles, never white. This is what makes Misri recognisable with the name hidden.
- **Voice:** short, plain, a club organiser talking to players. Say what
  happens ("Your opponent goes through"), not marketing ("Seamless brackets").
  No em dashes; no buzzwords; CTAs name the action ("Create a league",
  "Copy link", "Hand over").

## Palette (tokens in `apps/web/src/styles.css`)

| Role | Light | Why |
| --- | --- | --- |
| Background | `#fbf8e6` cream | the board; warm, easy on a phone at night |
| Ink | `#1f4d3a` deep green | text and icons; one hue family with the accent |
| Card | `#f0f2e1` | tiles sit on the board without borders |
| Accent | `#2b7350` green | the one accent: primary actions, active state, wins |
| Destructive | `#c2412f` | leave/delete/errors only |
| Played move | `#2f6f9f` blue | training boards only, to tell "your move" from "best move" |

Dark mode is its own pick (charcoal, green glow), not an inversion. Both themes
ship and both must pass contrast.

## Type

- **Bricolage Grotesque** for everything: a friendly, slightly quirky
  grotesque with optical sizes, so one family carries both headings and UI
  without feeling corporate.
- `.display` (tight tracking) for page titles and competition names.
- `.kicker`: small uppercase labels with modest 0.08em tracking, only for
  metadata above a value ("Invite code", "Open competitions"), never as a
  section headline.
- `.numeric` (tabular figures) for scores, tables, counts and codes.

## Shape and depth

- Radius 1rem on cards and inputs; pills only for chips and segmented choices.
- One soft card shadow (`--shadow-card`) marks a tile as a surface. Popovers
  and toasts get a border plus shadow. No glow, no glass.

## Composition

- Mobile first, one column, max ~640px; the sidebar appears only when signed in.
- One focal point per screen: the competition name, the board, or the form.
- Section variety comes from content (table vs fixtures vs bracket), not
  alternating backgrounds.

## Motion (dial 1)

- Hover/press feedback (press scales to 0.96), small cross-fades for state
  swaps (copy to tick), toasts sliding in. Nothing loops; everything respects
  `prefers-reduced-motion`. Confetti is reserved for a real win.

## Icons

- Solar (bold-duotone for nav/active, linear for inline) and Hugeicons, chosen
  for their rounder, friendlier weight that matches Bricolage. The wand icon is
  used only for "Suggest a name", where generating an idea is literally the
  action.
