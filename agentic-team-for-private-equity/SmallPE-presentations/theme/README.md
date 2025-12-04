# Slidev Theme – Inloop Studio

Custom Slidev theme implementing the Inloop brand system (fonts, colors, logo, and background textures).

## Quick start

- Install deps: `pnpm install` (or `yarn`, `npm i`)
- Start dev: `pnpm dev`
- Open: http://localhost:3030

The sample `slides.md` is already wired to use the local theme (`theme: ./`).

## Brand elements applied

- Fonts: Inter (sans), Instrument Serif (serif), Fira Code (mono/labels)
- Colors: Primary Aztec Purple `#7147FF`, palette from brand guide
- Logo: Inloop wordmark rendered on every slide (auto light/dark)
- Background: Grid textures (dots/squares) with light Inloop background

## Slide helpers

- Background: Vector dotted canvas is default (no class needed)
- Serif headings on a slide: add `class: serif` (optional, now headings are serif by default)
- Eyebrow label style: use `<span class="eyebrow">[FEATURE]</span>`

## Local fonts

This theme references local font files under `assets/fonts/`.
They were copied from the Inloop brand guidelines repo:

- `assets/fonts/inter/Inter_18pt-*.ttf`
- `assets/fonts/instrument-serif/InstrumentSerif-*.ttf`
- `assets/fonts/fira-code/FiraCode-*.ttf`

If you add or remove weights, update `styles/theme.css` @font-face rules accordingly.

## Using this theme in other Slidev decks

Option A – Local folder reference in another deck:

- Copy the `layouts/`, `styles/`, `components/`, `assets/`, and `layoutHelper.ts` into a folder (e.g. `themes/inloop/`) inside your deck.
- In that deck’s frontmatter: `theme: ./themes/inloop`

Option B – Publish as npm package:

- Ensure `package.json` has the `slidev-theme` keyword (already added).
- Publish to npm and then use `theme: @inloopstudio/slidev-theme-inloopstudio` in your decks.
# slidev-theme-inloopstudio
