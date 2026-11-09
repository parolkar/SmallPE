#!/usr/bin/env node
/**
 * Put a "Classic mode" button beside the account control at the foot of DS Bot's sidebar.
 *
 * DS Bot can hand the window back to DSH's classic Agent interface, but the only way in
 * is Settings -> General -> Mode -> Switch, four clicks deep. Its own settings row is
 *
 *   <button className="bt-soft bt-soft-sm" onClick={() => actions.setSurface("agent")}>
 *
 * and this adds the same call one click away.
 *
 * WHY A PATCH, HAVING TRIED NOT TO
 *
 * The shell documents a seat for exactly this — `sidebar.footer.action`, "optional
 * actions beside Settings at the sidebar foot" — and a plugin registering there was the
 * first attempt. It does not work in bot mode. DS Bot paints its own left column over
 * the shell's sidebar; measured at the seat's own coordinates the stack is
 *
 *   DIV.bt-list                DS Bot's bot list
 *   DIV.bt-side
 *   DIV.bt-leftcol             background rgb(247,247,247), z-index 25, opaque
 *
 * with the seat's occupant laid out underneath at 28x36 and perfectly invisible. The
 * second attempt injected a sibling of `.bt-account` with a MutationObserver; the node
 * measured correctly at (42,805) and still painted nothing, because that subtree belongs
 * to DS Bot's React tree. DS Bot declares no extension point of its own, so rendering
 * inside its component is the only way for the button to actually appear.
 *
 * Patching also buys the better behaviour: `actions` is in scope here, so the button
 * calls `setSurface("agent")` directly — the same instant switch the settings row makes,
 * with no page reload and no writing to ds-bot's localStorage behind its back.
 *
 * Run by bin/install.sh. Idempotent, and it refuses to apply if the foot is reworded
 * rather than guessing at a new shape.
 *
 * Usage:  node dsh/scripts/patch-dsbot-classic-switch.mjs [path/to/ds-bot/client.js]
 */

import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

/** Marks the patch so a second run is a no-op. */
const MARKER = 'smallpe-classic-mode'

/**
 * The wide foot as ds-bot renders it: one child, the account launcher.
 * `import_react33` is the bundler's local name for React in this build. It moves between
 * releases, which is precisely why this is matched literally and fails loudly.
 */
const FROM = 'const foot = wideContent ? (0, import_react33.createElement)("div", '
  + '{ className: "bt-leftcol-foot" }, (0, import_react33.createElement)(AccountLauncher, '
  + '{ seat: false, actions }))'

/**
 * The same, with our button after it.
 *
 * `bt-round` is the class ds-bot gives the round icon buttons in the rail foot, so the
 * chrome matches its neighbours instead of being invented here.
 */
const TO = 'const foot = wideContent ? (0, import_react33.createElement)("div", '
  + '{ className: "bt-leftcol-foot" }, (0, import_react33.createElement)(AccountLauncher, '
  + '{ seat: false, actions }), '
  + `(0, import_react33.createElement)("button", { type: "button", className: "bt-round ${MARKER}", `
  + '"aria-label": t("Classic mode"), title: t("Classic mode"), '
  + 'onClick: () => actions.setSurface("agent") }, '
  + '(0, import_react33.createElement)("svg", { width: 18, height: 18, viewBox: "0 0 20 20", '
  + 'fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round", '
  + 'strokeLinejoin: "round", "aria-hidden": true }, '
  + '(0, import_react33.createElement)("path", { d: "M3.5 7h12m0 0-3-3m3 3-3 3" }), '
  + '(0, import_react33.createElement)("path", { d: "M16.5 13h-12m0 0 3-3m-3 3 3 3" }))))'

const target = process.argv[2] ?? path.resolve(
  process.env.DSH_HOME ?? path.resolve(import.meta.dirname, '..', 'home'),
  'profiles/web/node_modules/ds-bot/client.js',
)

let source
try {
  source = await readFile(target, 'utf8')
} catch (error) {
  if (error.code === 'ENOENT') {
    console.log(`[smallpe] ds-bot is not installed at ${target} — no Classic mode button to add.`)
    process.exit(0)
  }
  throw error
}

if (source.includes(MARKER)) {
  console.log('[smallpe] ds-bot already has the Classic mode button.')
  process.exit(0)
}

const occurrences = source.split(FROM).length - 1
if (occurrences !== 1) {
  console.error(
    `[smallpe] patch-dsbot-classic-switch: expected exactly one sidebar foot in\n`
    + `          ${target}\n`
    + `          found ${occurrences}. ds-bot has changed how it renders the foot (or renamed its\n`
    + '          React import). Re-read the `const foot = wideContent ?` branch and update\n'
    + '          dsh/scripts/patch-dsbot-classic-switch.mjs. Refusing to guess.',
  )
  process.exit(1)
}

await writeFile(target, source.replace(FROM, TO))
console.log('[smallpe] ds-bot: Classic mode button added beside the account control.')
