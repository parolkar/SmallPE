#!/usr/bin/env node
/**
 * Put the SmallPE logo on dsh-ui-auth's server-rendered sign-in pages.
 *
 * `dsh-ui-auth` renders the login, register and register-success pages itself, in the
 * host, as HTML string concatenation, each headed by
 *
 *   <div class="brand">DeepSeek Harness</div>
 *
 * None of the branding plugins can reach them. `dsh-custom-logo` only restyles the
 * in-app sidebar, and `@local/smallpe-brand` taps `index.html` — the SPA shell, which a
 * signed-out visitor never gets, because the gateway redirects them to /auth/login first.
 *
 * WHY THE LOGO IS INLINED
 *
 * The obvious fix, `<img src="/custom-logo/logo-wide.png">`, serves a broken image. The
 * gateway treats exactly one prefix as public — `pathname === '/auth' ||
 * pathname.startsWith('/auth/')` — and answers everything else to an unauthenticated
 * caller with 401, assets included:
 *
 *   $ curl -o /dev/null -w '%{http_code}' localhost:3080/custom-logo/logo-wide.png
 *   401
 *
 * So the PNG is read in the host and inlined as a data URI. It comes from the same
 * `<DSH_HOME>/branding/logo-wide.png` dsh-custom-logo serves, so the sign-in page and the
 * sidebar always show the one configured logo, and a logo uploaded through
 * dsh-custom-logo's admin panel is picked up on the next request — the file is re-read
 * when its size or mtime changes. With no branding directory it falls back to a "SmallPE"
 * wordmark, which is still better than the upstream name.
 *
 * Inlining is safe against the page's own translator: `translateHtml()` substitutes over
 * the whole HTML string, but every phrase in its table is Chinese and base64 is ASCII, so
 * no substitution can land inside the payload.
 *
 * Run by dsh/scripts/enable-auth.sh, after localize-ui-auth.mjs. Idempotent, and it
 * refuses to apply if the pages no longer look the way it expects.
 *
 * Usage:  node dsh/scripts/patch-ui-auth-branding.mjs [path/to/dsh-ui-auth/lib/index.js]
 */

import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

/** Marks the patch so a second run is a no-op. */
const MARKER = '__smallpeBrandMark'

/**
 * The helper, inserted at module scope so all three page builders can see it.
 *
 * Anchored on the first statement after the import block, which keeps the two `import`
 * declarations it adds alongside the rest of them.
 */
const ANCHOR = "export const name = 'dsh-ui-auth';\n"

const HELPER = `// --- SmallPE: brand the server-rendered auth pages (dsh/scripts/patch-ui-auth-branding.mjs) ---
// These pages are served before a session exists, and the gateway only lets /auth/* through
// unauthenticated — /custom-logo/logo-wide.png answers 401 there — so the configured logo is
// inlined. Same file dsh-custom-logo serves; re-read when it changes.
import { readFileSync as __smallpeReadFile, statSync as __smallpeStat } from 'node:fs';
import { join as __smallpeJoin } from 'node:path';
const __smallpeBrandCache = { key: null, html: '' };
function ${MARKER}() {
\tconst file = __smallpeJoin(process.env.DSH_HOME ?? process.cwd(), 'branding', 'logo-wide.png');
\tlet key;
\ttry {
\t\tconst stat = __smallpeStat(file);
\t\tkey = stat.size + ':' + stat.mtimeMs;
\t} catch {
\t\tkey = 'absent';
\t}
\tif (key === __smallpeBrandCache.key) return __smallpeBrandCache.html;
\t// The wordmark is the fallback: no branding directory, or a PNG we cannot read.
\tlet html = '<div class="brand">SmallPE</div>';
\tif (key !== 'absent') {
\t\ttry {
\t\t\thtml = '<img class="brand" alt="SmallPE" src="data:image/png;base64,'
\t\t\t\t+ __smallpeReadFile(file).toString('base64') + '">';
\t\t} catch { /* keep the wordmark */ }
\t}
\t__smallpeBrandCache.key = key;
\t__smallpeBrandCache.html = html;
\treturn html;
}
// --- end SmallPE -------------------------------------------------------------------

`

/**
 * Each edit is [what must be there, what replaces it, how many times].
 * Every count is asserted before anything is written.
 */
const EDITS = [
  // The brand line on all three pages: login, register, register-success.
  [
    '            \'<div class="brand">DeepSeek Harness</div>\' +\n',
    `            ${MARKER}() +\n`,
    3,
  ],
  // Keep the wordmark rule for the fallback and add one for the image.
  [
    "            '.brand{font-size:20px;font-weight:700;letter-spacing:.3px;margin-bottom:4px}' +\n",
    "            '.brand{font-size:20px;font-weight:700;letter-spacing:.3px;margin-bottom:4px}' +\n"
    + "            'img.brand{display:block;height:36px;width:auto;max-width:100%;margin:0 0 10px}' +\n",
    3,
  ],
  // The tab titles. `translateHtml()` substitutes over the whole page, but none of these
  // three Chinese words are in its table, so the tab read "登录 · DeepSeek Harness" even on
  // an English install. Written out in English for the same reason localize-ui-auth.mjs
  // does it: this deployment is English-only.
  ["'<title>登录 · DeepSeek Harness</title><style>'", "'<title>Sign in · SmallPE</title><style>'", 1],
  ["'<title>注册 · DeepSeek Harness</title><style>'", "'<title>Create account · SmallPE</title><style>'", 1],
  ["'<title>注册成功 · DeepSeek Harness</title><style>'", "'<title>Account created · SmallPE</title><style>'", 1],
]

const target = process.argv[2] ?? path.resolve(
  process.env.DSH_HOME ?? path.resolve(import.meta.dirname, '..', 'home'),
  'profiles/web/node_modules/dsh-ui-auth/lib/index.js',
)

let source
try {
  source = await readFile(target, 'utf8')
} catch (error) {
  if (error.code === 'ENOENT') {
    console.log(`[smallpe] dsh-ui-auth is not installed at ${target} — no sign-in page to brand.`)
    process.exit(0)
  }
  throw error
}

if (source.includes(MARKER)) {
  console.log('[smallpe] dsh-ui-auth sign-in pages already carry the SmallPE logo.')
  process.exit(0)
}

/** Check every anchor before writing, so a reworded release changes nothing at all. */
const wrong = []
if (!source.includes(ANCHOR)) wrong.push(`the module header (${ANCHOR.trim()}) — 0 found, expected 1`)
for (const [from, , expected] of EDITS) {
  const found = source.split(from).length - 1
  if (found !== expected) wrong.push(`${JSON.stringify(from.trim().slice(0, 60))} — ${found} found, expected ${expected}`)
}

if (wrong.length > 0) {
  console.error(
    '[smallpe] patch-ui-auth-branding: the sign-in pages are not shaped as expected in\n'
    + `          ${target}\n`
    + wrong.map((line) => `            * ${line}\n`).join('')
    + '          dsh-ui-auth has rewritten its server-rendered pages. Re-read loginPage(),\n'
    + '          registerPage() and registerSuccessPage(), then update\n'
    + '          dsh/scripts/patch-ui-auth-branding.mjs. Refusing to guess.',
  )
  process.exit(1)
}

let patched = source.replace(ANCHOR, HELPER + ANCHOR)
for (const [from, to] of EDITS) patched = patched.split(from).join(to)

await writeFile(target, patched)
console.log('[smallpe] dsh-ui-auth: sign-in pages now show the configured SmallPE logo.')
