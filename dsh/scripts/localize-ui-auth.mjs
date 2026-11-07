#!/usr/bin/env node
/**
 * Put the one dsh-ui-auth dialog its own localiser cannot reach into English.
 *
 * Why this exists
 * ---------------
 * dsh-ui-auth is written in Chinese and localises itself at run time: a MutationObserver
 * sweeps the DOM and substitutes from a 323-entry zh->en phrase table. But the sweep only
 * visits the roots it recognises as its own —
 *
 *   document.querySelectorAll('.dshua, [role=dialog]')        (lib/client.js, translateOurDom)
 *
 * — and the TOTP reminder shown right after sign-in is built by hand and appended straight
 * to document.body with neither marker:
 *
 *   overlay.id = "dshua-totp-reminder"                        (lib/client.js, showTotpReminder)
 *
 * So that one dialog stays Chinese on an otherwise English install. Adding the missing
 * class would hand it to the sweep, but the table only covers it in part — the body comes
 * out half-translated ("为增强账号安全，建议在【设置】→【User management】中Add a sign-in
 * factor: …"), which is worse than leaving it alone. The four strings are therefore
 * replaced outright, reusing upstream's own wording for the three it does translate
 * cleanly, and writing the body properly.
 *
 * Run by dsh/scripts/enable-auth.sh, so it covers both the local opt-in and the container
 * image (the Dockerfile runs that same script). Re-running is safe.
 *
 * Usage:  node dsh/scripts/localize-ui-auth.mjs [path/to/dsh-ui-auth/lib/client.js]
 *
 * Upstream: https://github.com/0QwQ0/dsh-ui-auth — this belongs there as a bug report;
 * until it lands, every reinstall of the plugin needs this applied again.
 */

import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

/**
 * Each string as dsh-ui-auth emits it, with the English that replaces it.
 *
 * `binding` is the local variable showTotpReminder assigns to, and it is part of the match
 * for a reason: this same bundle carries the phrase table, where three of these four
 * strings appear AGAIN as translation keys —
 *
 *   ['建议开启两步验证', 'Turn on two-step verification'],
 *
 * Matching the bare string literal rewrites those keys too, turning an entry into
 * ['Later', 'Later'] and silently dropping zh->en for every OTHER dialog that uses the
 * same word. Anchoring on `<binding>.textContent = ` keeps the edit to the one dialog and
 * leaves the table whole.
 */
const REPLACEMENTS = [
  {
    what: 'title',
    binding: 'title',
    // Upstream's own translation, from its phrase table.
    zh: '建议开启两步验证',
    en: 'Turn on two-step verification',
  },
  {
    what: 'body',
    binding: 'body',
    // The phrase table renders this one half in Chinese, so it is written out here.
    zh: '为增强账号安全，建议在【设置】→【用户管理】中添加登录因子：TOTP 动态码令牌（Google Authenticator / Microsoft Authenticator 等）或通行密钥（指纹 / 面容 / 设备 PIN）。也可以永久忽略此提醒。',
    en: 'For stronger account security, add a sign-in factor under Settings → User management: a TOTP token (Google Authenticator, Microsoft Authenticator and similar) or a passkey (fingerprint, face, device PIN). You can also dismiss this reminder permanently.',
  },
  { what: 'dismiss button', binding: 'later', zh: '稍后再说', en: 'Later' },
  { what: 'ignore button', binding: 'ignore', zh: '永久忽略', en: 'Ignore permanently' },
]

/** The exact assignment showTotpReminder emits, which is what we match and rewrite. */
const assignment = (binding, text) => `${binding}.textContent = ${JSON.stringify(text)}`

const DEFAULT_TARGET = path.resolve(
  process.env.DSH_HOME ?? path.resolve(import.meta.dirname, '..', 'home'),
  'profiles/web/node_modules/dsh-ui-auth/lib/client.js',
)

const target = process.argv[2] ?? DEFAULT_TARGET

let source
try {
  source = await readFile(target, 'utf8')
} catch (error) {
  // Not an error: the plugin is opt-in, and skipping is the correct outcome when it is absent.
  if (error.code === 'ENOENT') {
    console.log(`[smallpe] dsh-ui-auth is not installed at ${target} — nothing to localise.`)
    process.exit(0)
  }
  throw error
}

let patched = source
const applied = []
const already = []
const missing = []

for (const { what, binding, zh, en } of REPLACEMENTS) {
  const from = assignment(binding, zh)
  const to = assignment(binding, en)
  const occurrences = patched.split(from).length - 1
  if (occurrences === 1) {
    patched = patched.replace(from, to)
    applied.push(what)
  } else if (occurrences > 1) {
    // One dialog, one assignment. More than one means the file is not shaped as expected.
    missing.push(`${what} (matched ${occurrences} times, expected 1)`)
  } else if (patched.includes(to)) {
    already.push(what)
  } else {
    missing.push(what)
  }
}

// Fail loudly rather than leaving a half-translated dialog: a dsh-ui-auth release that
// rewords this prompt should be noticed here, not by a user meeting Chinese after login.
if (missing.length > 0) {
  console.error(
    `[smallpe] localize-ui-auth: could not find the ${missing.join(', ')} string(s) in\n`
    + `          ${target}\n`
    + '          dsh-ui-auth has probably reworded its TOTP reminder. Update REPLACEMENTS in\n'
    + '          dsh/scripts/localize-ui-auth.mjs to match the new text.',
  )
  process.exit(1)
}

if (applied.length === 0) {
  console.log('[smallpe] dsh-ui-auth TOTP reminder is already in English.')
  process.exit(0)
}

// The three short strings are also phrase-table keys. Losing one would quietly stop the
// run-time sweep translating that word everywhere else, which is invisible until someone
// meets a Chinese button in another dialog — so prove the table survived.
const tableKeys = REPLACEMENTS.filter(({ zh }) => source.split(JSON.stringify(zh)).length - 1 > 1)
const clobbered = tableKeys.filter(({ zh }) => !patched.includes(JSON.stringify(zh)))
if (clobbered.length > 0) {
  console.error(
    `[smallpe] localize-ui-auth: refusing to write — the phrase-table key(s) for `
    + `${clobbered.map(({ what }) => what).join(', ')} would be destroyed. This is a bug in `
    + 'this script, not in dsh-ui-auth; the match is too broad.',
  )
  process.exit(1)
}

await writeFile(target, patched)
console.log(
  `[smallpe] dsh-ui-auth TOTP reminder translated (${applied.join(', ')})`
  + `${already.length > 0 ? `; already English: ${already.join(', ')}` : ''}.`,
)
