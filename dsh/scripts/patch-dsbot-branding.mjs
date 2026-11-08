#!/usr/bin/env node
/**
 * Brand DS Bot's UI as SmallPE.
 *
 * This install is a SmallPE adaptation, but the bundled UI still says "DS Bot" in the
 * settings nav ("About DS Bot"), the Recent-errors source labels, the update banners, and
 * the Feedback page — which also offers to file a bug on the upstream GitHub repository.
 * None of that is right for a SmallPE deployment.
 *
 * TEXT AND DESTINATION ONLY. No element is removed, no handler is changed, no feature is
 * turned off. Two kinds of edit:
 *
 *   1. Targeted replacements for the feedback and About strings, in English and in the
 *      Chinese translation table beside them.
 *   2. A global "DS Bot" -> "SmallPE" over the client bundle.
 *
 * The global pass is safe because every "DS Bot" in the bundle is display text: i18n
 * entries, an aria-label, the `SOURCES` labels rendered as "· DS Bot" under each error,
 * and headings. Identifiers use the lowercase, hyphenated form (`ds-bot-chats`,
 * `[ds-bot]` log prefixes), which this never matches. The i18n table maps English source
 * strings to Chinese, so replacing the same text in keys and call sites together keeps
 * every lookup intact.
 *
 * WHAT IS DELIBERATELY LEFT ALONE
 *
 *   * The GitHub CONNECTOR. "GitHub token", "Create a token on GitHub", "Could not reach
 *     GitHub" and friends belong to a real integration users configure, not to upstream
 *     branding. Rebranding those would describe the wrong service.
 *   * Runtime error text such as `update to ds-bot@0.3.1 failed: already-installed`. That
 *     names the npm package actually being updated; making it say SmallPE would make
 *     diagnostics lie, and the lines already on screen are stored history anyway.
 *
 * Run by bin/install.sh after the typing patch. Idempotent. Re-run after any
 * `pnpm install` in the profile, which restores the npm copy.
 *
 * Usage:  node dsh/scripts/patch-dsbot-branding.mjs [path/to/ds-bot]
 */

import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

/**
 * Every outward link in the bot UI goes here. Not the marketing root: a user who clicks
 * "report a problem" or "source code" in a SmallPE deployment wants the support page.
 */
const SUPPORT_URL = 'https://smallpe.com/support/'

/**
 * Feedback and About strings, replaced before the global pass because several contain
 * "DS Bot" themselves. English first, then the Chinese value sitting beside it.
 */
const CLIENT_EDITS = [
  // --- Feedback page -------------------------------------------------------------- //
  ['GitHub issue', 'Problem report'],
  ['Report on GitHub', 'Send to SmallPE'],
  ['在 GitHub 上报告', '发送给 SmallPE'],
  [
    'Opens a new issue in the DS Bot repository with all of this filled in. Nothing is sent until you submit it there.',
    `Opens SmallPE feedback with all of this filled in. Nothing is sent until you submit it there.`,
  ],
  [
    '在 DS Bot 仓库新建一个 issue，并填好以上内容。你在 GitHub 上提交之前，什么都不会发出。',
    '打开 SmallPE 反馈页并填好以上内容。你提交之前，什么都不会发出。',
  ],
  [
    'Opened a new GitHub issue with the diagnostics filled in. Check it before you submit.',
    'Opened SmallPE feedback with the diagnostics filled in. Check it before you submit.',
  ],
  [
    '已打开新的 GitHub issue，诊断信息已填好。提交前请检查一遍。',
    '已打开 SmallPE 反馈页，诊断信息已填好。提交前请检查一遍。',
  ],
  [
    'Opened a new GitHub issue. Copy the diagnostics below into it.',
    'Opened SmallPE feedback. Copy the diagnostics below into it.',
  ],
  ['已打开新的 GitHub issue。请把下面的诊断信息复制进去。', '已打开 SmallPE 反馈页。请把下面的诊断信息复制进去。'],
  [
    'Opened a new GitHub issue. The diagnostics are long, so they are on the clipboard: paste them into the issue.',
    'Opened SmallPE feedback. The diagnostics are long, so they are on the clipboard: paste them in.',
  ],
  [
    '已打开新的 GitHub issue。诊断信息太长，已复制到剪贴板，请粘贴到 issue 里。',
    '已打开 SmallPE 反馈页。诊断信息太长，已复制到剪贴板，请粘贴进去。',
  ],
  // --- About page ------------------------------------------------------------------ //
  // Upstream promotes starring its repository. A SmallPE install should point at SmallPE.
  ['Star DS Bot on GitHub', 'SmallPE Support'],
  ['在 GitHub 上给 DS Bot 点 Star', 'SmallPE 支持'],
  [
    'If DS Bot helps you, a star on GitHub helps more people find it.',
    'Commercial support and help with SmallPE.',
  ],
  [
    '如果 DS Bot 对你有用，欢迎在 GitHub 上点个 Star，让更多人看到它。',
    'SmallPE 的商业支持与帮助。',
  ],
  ['Source code', 'SmallPE Support'],
  ['源代码', 'SmallPE 支持'],
]

/** Where "Report a problem" sends people. */
const HOST_EDITS = [
  [
    "export const ISSUES_URL = 'https://github.com/Fei2411/DS-Bot/issues/new'",
    `export const ISSUES_URL = '${SUPPORT_URL}'`,
  ],
]

/**
 * The About page builds its outward links from what the host reports, so the upstream
 * repository has to stop being reported at all — relabelling the client would still
 * leave a link to github.com/Fei2411/DS-Bot behind it.
 *
 * `repoSlug()` itself is deliberately NOT touched: dsh-update.js uses it to find the
 * verified-DSH manifest, so breaking it would break the update check. Only what reaches
 * the screen is changed.
 */
const HOST_UPDATE_EDITS = [
  [
    `const repoUrl = () => {
  const repo = repoSlug()
  return repo ? \`https://github.com/\${repo}\` : null
}`,
    `const repoUrl = () => '${SUPPORT_URL}' // SmallPE: never surface the upstream repository`,
  ],
  [
    `const releasesUrl = () => {
  const repo = repoUrl()
  return repo ? \`\${repo}/releases\` : (PKG.homepage ?? null)
}`,
    `const releasesUrl = () => '${SUPPORT_URL}' // SmallPE: "what's new" goes to support too`,
  ],
  [
    `  async function repoStars() {
    const repo = repoSlug()`,
    `  async function repoStars() {
    // SmallPE: the About page must not show the upstream project's star count, and we
    // make no call to api.github.com for it. Nulling the local binding leaves repoSlug()
    // working for the DSH update check in dsh-update.js, which depends on it.
    const repo = null`,
  ],
]

const root = process.argv[2] ?? path.resolve(
  process.env.DSH_HOME ?? path.resolve(import.meta.dirname, '..', 'home'),
  'profiles/web/node_modules/ds-bot',
)

const clientPath = path.join(root, 'client.js')
const hostPath = path.join(root, 'src/host/diagnostics.js')
const updatePath = path.join(root, 'src/host/update.js')

/**
 * Apply one file's edits.
 * @param {string} file absolute path
 * @param {[string, string][]} edits from -> to, each required exactly once
 * @param {(text: string) => string} [after] optional pass applied once the edits land
 * @returns {Promise<'patched' | 'already' | 'absent'>}
 */
async function patch(file, edits, after) {
  let source
  try {
    source = await readFile(file, 'utf8')
  } catch (error) {
    if (error.code === 'ENOENT') return 'absent'
    throw error
  }

  // Already branded: every edit's target text present and no source text left.
  const pending = edits.filter(([from]) => source.includes(from))
  if (pending.length === 0) return 'already'

  if (pending.length !== edits.length) {
    const missing = edits.filter(([from]) => !source.includes(from)).map(([from]) => from.slice(0, 48))
    console.error(
      `[smallpe] patch-dsbot-branding: ${path.basename(file)} matched only some strings.\n`
      + `          missing: ${missing.join(' | ')}\n`
      + '          ds-bot has reworded its UI. Re-read the strings and update\n'
      + '          dsh/scripts/patch-dsbot-branding.mjs. Refusing a half-branded UI.',
    )
    process.exit(1)
  }

  let text = source
  for (const [from, to] of edits) text = text.split(from).join(to)
  if (after !== undefined) text = after(text)
  await writeFile(file, text)
  return 'patched'
}

const client = await patch(clientPath, CLIENT_EDITS, (text) => text.split('DS Bot').join('SmallPE'))
const host = await patch(hostPath, HOST_EDITS)
const links = await patch(updatePath, HOST_UPDATE_EDITS)

if (client === 'absent' && host === 'absent' && links === 'absent') {
  console.log(`[smallpe] ds-bot is not installed at ${root} — nothing to brand.`)
  process.exit(0)
}
for (const [what, state] of [['client UI', client], ['feedback URL', host], ['About links', links]]) {
  const said = { patched: 'branded as SmallPE', already: 'already branded', absent: 'not present' }[state]
  console.log(`[smallpe] ds-bot ${what}: ${said}.`)
}
