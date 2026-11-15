# SkyReady UI guidelines — keep it uncluttered

The owner asked for a **less cluttered UI throughout**. Apply these rules on every page.

1. **One job per view.** The first screen of a page should show its primary task only. Move secondary
   material (reference text, exercises, history, advanced options, explanations) into **tabs** (`@/components/ui/tabs`),
   a collapsible section (`<details>` or `@/components/ui/collapsible`), a dialog/sheet, or a second step.
2. **One disclaimer per page, at most.** Use `<Notice tone="caution" title="Short headline.">long text</Notice>` —
   it renders as a single quiet line with a "Details" toggle. Delete duplicate disclaimers; never stack several
   notices. Do not repeat what the sidebar/footer already says.
3. **Fewer boxes.** Avoid wrapping everything in bordered panels; nested panels-in-panels are not allowed. Use
   whitespace and simple headings to separate content. Prefer a plain list/table over a grid of cards.
4. **Less text on screen.** Cut helper sentences that restate the label. Move "how it works" explanations into
   a tooltip (`@/components/ui/tooltip`), an (i) popover, or a collapsed section.
5. **Fewer simultaneous controls.** Group rarely used controls behind a "More"/"Advanced" toggle or a menu.
   Show the 3–5 most important actions; keep the rest one click away.
6. **Empty states:** when there is no data, show one small empty state — don't render several empty panels.
7. **Badges/pills:** max ~2 per item; remove decorative ones.
8. **Keep every feature working.** Decluttering means re-organising and hiding, not deleting functionality,
   routes, search params, stored data or required legal labels (simulated / unofficial / not for navigation /
   not loggable / not an FAA test). Keep labels short.
9. Responsive: must still work at 390 px wide with no horizontal page scroll.

## Brand & motion

- **Name:** the product is **SkyReady** (one word, capital S and R). In the wordmark "Ready" carries the
  brand gradient. Short code for fictional product names and tail marks: `SR-` (e.g. SR-750 Navigator,
  SR-172).
- **Logo:** `<Logo />` / `<LogoMark />` from `@/components/brand/Logo` — a check mark ("ready") whose long
  stroke becomes a takeoff climb, with an aircraft lifting off its tip. Never redraw it inline; favicons
  live in `public/favicon.svg`, `favicon.ico`, `apple-touch-icon.png` (and `flightsim/public/favicon.svg`,
  `public/sim/favicon.svg` for the simulator).
- **Saved data:** browser storage keys start with `skyready-` (site) and `skyready.sim.` (simulator).
  Values saved under the old TeachX names are moved over automatically (`src/lib/legacy-storage.ts`,
  `flightsim/src/core/storage.ts`); keep those helpers until old visitors have had time to return.
- **Fonts:** headings (`h1`, `h2`) use Sora (`font-display`); body text Inter; numbers JetBrains Mono.
- **Primary actions:** `<Button>` (default variant) or the `btn-glow` class on a link. Secondary on imagery:
  `btn-ghost-glass`. One glowing button per area.
- **Interactive cards/rows:** add `panel spotlight` (cursor glow + lit border) and optionally `lift`
  (hover rise). Set `--spot` to a token (e.g. `var(--ok)`) to colour the glow.
- **Entrances:** `<Page>` already staggers its direct children in; don't add more page-level animation.
  Use `animate-fade-in-up` / `animate-rise` for smaller reveals (they leave no transform behind).
- **Reduced motion:** CSS animations are disabled automatically. JS-driven animation must check
  `useReducedMotion()` from `@/hooks/use-reduced-motion`.
- **Night (red) lighting:** fixed-colour artwork must carry `tx-night-tint` so it turns red in that mode.
