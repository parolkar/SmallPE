# @local/smallpe-brand

Brands the sidebar with the **SmallPE** logo — the images served by
**dsh-custom-logo** from `$DSH_HOME/branding` — so a DS Bot session carries the
same branding as the rest of the app:

| Seat | Image | Where it shows |
|---|---|---|
| `sidebar.brand.mark` | `/custom-logo/logo-64.png` | collapsed rail |
| `sidebar.brand.name` | `/custom-logo/logo-wide.png` | expanded brand row |

## How it works

The brand is drawn in **two different places**, because the two shells differ:

1. **The shipped sidebar's seats** — `sidebar.brand.mark` (collapsed rail and
   the expanded row's leading mark) and `sidebar.brand.name` (the expanded
   name), rendered by the shell's `div.logoRow`. Both are **`single` slots where
   the lowest priority wins**. DS Bot occupies them at `-100`, but its
   `freePriority` helper reads the current entries and sinks one below the
   holder, so a fixed priority loses the seat as soon as its shell installs.
   `claimSeat()` therefore watches each seat and takes it back whenever a rival
   ends up lower.
2. **DS Bot's own expanded brand row.** In bot mode the DS Bot shell renders
   `BrandMark` (the whale, `.bt-brand-whale`) and `BrandName` (`"DS Bot"`)
   *directly* inside `span.bt-brand` under `.bt-side-top` — it does not go
   through those seats, so **no occupant can replace it**. That markup is styled
   instead: its two child spans are hidden and the wide lockup is painted on
   `span.bt-brand`, the same way dsh-custom-logo styles the shipped brand
   button.

Other details:

- Images come from dsh-custom-logo's host route and are cache-busted with the
  mtimes `/custom-logo/state` reports, so re-uploading a logo reaches the
  browser on a plain reload. The stylesheet is rebuilt once those mtimes arrive.
- The shell's expanded row hides `[class*="brandMark"]` because the wide lockup
  already contains the square mark.
- This plugin draws the brand images, so it drops the background copies
  dsh-custom-logo paints (`button[class*="_brand"]` and the collapsed toggle);
  otherwise the two would draw on top of each other.

## Dependencies

Needs **dsh-custom-logo** mounted: it owns the `/custom-logo/*` route and the
fixed filenames `/custom-logo/logo-64.png` and `/custom-logo/logo-wide.png`.
Without it the seats stay empty rather than showing a broken image.

## Tuning

- Shell seats: `BrandName`/`BrandMark` in `client.js` (the lockup is capped at
  `maxWidth: 100%` / `maxHeight: 42px`).
- DS Bot's own row: the `.bt-side-top .bt-brand` rule in `buildCss()` — the
  lockup is painted at `auto 26px` with a `92px` min-width.
