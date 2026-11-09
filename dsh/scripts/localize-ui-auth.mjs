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

/**
 * Hard-coded strings the phrase table does not cover (or only half covers) elsewhere in
 * Settings → User management, and the display name the host gives the first admin. Each is
 * matched as a whole code snippet that occurs exactly once, so a reworded release fails the
 * build instead of being half-translated.
 */
const LITERALS = [
  {
    what: 'add-user label',
    file: 'client',
    from: 'React.createElement("label", null, "新增用户：用户名")',
    to: 'React.createElement("label", null, "Add user: username")',
  },
  {
    what: 'username placeholder',
    file: 'client',
    from: 'placeholder: "2-32 位字母、数字、_ . -"',
    to: 'placeholder: "2-32 letters, digits, _ . -"',
  },
  // Passkey counters: the sweep translates the words around the number and leaves "个".
  { what: 'passkey count column', file: 'client', from: '(u.passkeyCount || 0) + " 个")', to: 'String(u.passkeyCount || 0))' },
  { what: 'passkey count badge', file: 'client', from: '"通行密钥 " + pk.list.length + " 个"', to: '"Passkeys: " + pk.list.length' },
  { what: 'bound passkeys badge', file: 'client', from: '"已绑定 " + pk.list.length + " 个"', to: '"Bound: " + pk.list.length' },
  { what: 'passkey limit note', file: 'client', from: '"已达上限 " + pk.max + " 个"', to: '"Limit reached: " + pk.max' },
  // A stored value rather than a label, so no sweep can reach it: the first admin was named
  // "管理员" (administrator) and showed up that way in My account.
  { what: 'first admin display name', file: 'index', from: "displayName: '管理员'", to: "displayName: 'Admin'" },
  // Error messages are translated per request from res.dshuaLocale, but handleAuthPath only
  // sets it after dispatching /auth/login, so every sign-in error ("Wrong username or
  // password", lock-outs) came back in Chinese although the table translates them.
  {
    what: 'sign-in error language',
    file: 'index',
    from: "if (pathname === '/auth/login') {\n            await handleLogin(req, res);",
    to: "if (pathname === '/auth/login') {\n            res.dshuaLocale = requestLocale(req);\n            await handleLogin(req, res);",
  },
]

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

// The host half sits beside the client bundle.
const hostTarget = path.join(path.dirname(target), 'index.js')
const hostSource = await readFile(hostTarget, 'utf8')

let patched = source
let hostPatched = hostSource
const applied = []
const already = []
const missing = []

const edits = [
  ...REPLACEMENTS.map(({ what, binding, zh, en }) => ({ what, file: 'client', from: assignment(binding, zh), to: assignment(binding, en) })),
  ...LITERALS,
]
for (const { what, file, from, to } of edits) {
  const text = file === 'index' ? hostPatched : patched
  const occurrences = text.split(from).length - 1
  if (occurrences === 1) {
    if (file === 'index') hostPatched = text.replace(from, to)
    else patched = text.replace(from, to)
    applied.push(what)
  } else if (occurrences > 1) {
    // One snippet, one occurrence. More than one means the file is not shaped as expected.
    missing.push(`${what} (matched ${occurrences} times, expected 1)`)
  } else if (text.includes(to)) {
    already.push(what)
  } else {
    missing.push(what)
  }
}

// Fail loudly rather than leaving a half-translated screen: a dsh-ui-auth release that
// rewords one of these strings should be noticed here, not by a user meeting Chinese.
if (missing.length > 0) {
  console.error(
    `[smallpe] localize-ui-auth: could not find the ${missing.join(', ')} string(s) in\n`
    + `          ${path.dirname(target)}\n`
    + '          dsh-ui-auth has probably reworded them. Update REPLACEMENTS / LITERALS in\n'
    + '          dsh/scripts/localize-ui-auth.mjs to match the new text.',
  )
  process.exit(1)
}

if (applied.length === 0) {
  console.log('[smallpe] dsh-ui-auth is already localised.')
  process.exit(0)
}

// The three short TOTP-reminder strings are also phrase-table keys. Losing one would quietly
// stop the run-time sweep translating that word everywhere else, which is invisible until
// someone meets a Chinese button in another dialog — so prove the table survived.
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

if (patched !== source) await writeFile(target, patched)
if (hostPatched !== hostSource) await writeFile(hostTarget, hostPatched)
console.log(
  `[smallpe] dsh-ui-auth localised (${applied.join(', ')})`
  + `${already.length > 0 ? `; already English: ${already.join(', ')}` : ''}.`,
)
