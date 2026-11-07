#!/usr/bin/env node
/**
 * Restore DS Bot's "thinking" indicator on DSH 0.2.1-rc.2.
 *
 * The symptom: you send a message to an agent and the UI shows nothing at all until the
 * whole reply lands — no shimmer, no elapsed timer, no sign the agent is working.
 *
 * The cause is a one-character DOM-contract skew between ds-bot@0.2.0 and this DSH.
 * ds-bot renders the indicator through a portal and looks for its container with
 *
 *   document.querySelector("[data-chat-flow] > [data-chat-running]")
 *
 * a DIRECT-CHILD selector. DSH 0.2.1-rc.2 wraps every slot contribution in its own
 * element, so the live DOM is
 *
 *   DIV[data-chat-flow] > DIV[data-slot] > DIV[data-chat-running]
 *
 * and the query never matches. `useRunningHost` therefore returns null and
 * `ActivityIndicator` bails at `if (!host || phase === null || !shown) return null`.
 *
 * Everything else about the component is already working, which is what makes this so
 * hard to see from the outside. Measured live, 250ms into a turn:
 *
 *   running: true      the session IS marked running
 *   liveKey: "{}"      nothing is streaming, so the indicator is not being suppressed
 *   phase:   "in"      the entrance animation has started
 *   shown:   { text: "Sorting out the details" }   the label is chosen
 *   [data-chat-running]                 present
 *   [data-chat-flow] > [data-chat-running]  ABSENT   <- only this
 *
 * Dropping the `>` makes it a descendant selector, which matches both the old and the new
 * shape. Verified against a live harness: `.bt-typing` goes from never appearing to
 * present for the whole run.
 *
 * Run by bin/install.sh, because ds-bot is a plain npm dependency and every
 * `pnpm install` restores the upstream file. Re-running is safe.
 *
 * Upstream: this belongs in ds-bot. Until it lands there, the patch is reapplied on each
 * install.
 *
 * Usage:  node dsh/scripts/patch-dsbot-typing.mjs [path/to/ds-bot/client.js]
 */

import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const FROM = '"[data-chat-flow] > [data-chat-running]"'
const TO = '"[data-chat-flow] [data-chat-running]"'

const target = process.argv[2] ?? path.resolve(
  process.env.DSH_HOME ?? path.resolve(import.meta.dirname, '..', 'home'),
  'profiles/web/node_modules/ds-bot/client.js',
)

let source
try {
  source = await readFile(target, 'utf8')
} catch (error) {
  if (error.code === 'ENOENT') {
    console.log(`[smallpe] ds-bot is not installed at ${target} — nothing to patch.`)
    process.exit(0)
  }
  throw error
}

if (source.includes(TO)) {
  console.log('[smallpe] ds-bot typing indicator is already patched.')
  process.exit(0)
}

const occurrences = source.split(FROM).length - 1
if (occurrences !== 1) {
  console.error(
    `[smallpe] patch-dsbot-typing: expected exactly one portal-host selector in\n`
    + `          ${target}\n`
    + `          found ${occurrences}. ds-bot has changed how it mounts the activity\n`
    + '          indicator — re-read useRunningHost and update this patch. Refusing to\n'
    + '          guess: a wrong selector here silently removes the indicator again.',
  )
  process.exit(1)
}

await writeFile(target, source.replace(FROM, TO))
console.log('[smallpe] ds-bot typing indicator patched (portal host is now a descendant match).')
