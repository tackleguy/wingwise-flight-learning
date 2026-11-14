# TeachX UI guidelines — keep it uncluttered

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
