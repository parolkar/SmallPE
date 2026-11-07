#!/usr/bin/env node
/**
 * Let dsh-ui-auth share one workspace across every signed-in user.
 *
 * Why a patch
 * -----------
 * dsh-ui-auth scopes everything per user through two predicates in its policy core:
 *
 *   const session   = (principal, id) => nonempty(id) && (principal.role === 'admin' || owners.session(id)   === principal.username);
 *   const workspace = (principal, id) => nonempty(id) && (principal.role === 'admin' || owners.workspace(id) === principal.username);
 *
 * Every other rule composes from those two — RPC authorization, result projection, and
 * the per-frame projection of the `workspace/follow` stream that builds the sidebar.
 *
 * SmallPE needs the DS Bot team folder visible to the whole team: the nine agents are
 * colleagues working in one shared space. That cannot be expressed through the supported
 * seam:
 *
 *   * ownership is single-owner — `claimOwner` throws "Object already belongs to another
 *     user", so the team workspace cannot simply be claimed by everyone; and
 *   * `registerPolicy` cannot reach the sidebar. Of the five kinds `PolicyRules` declares,
 *     only `http`, `rpc` and `upgrade` are ever dispatched (modern-gateway.js lines 325,
 *     384, 395, 433). `stream` and `remote` are declared and never consulted, and the
 *     frame projection that would hide the team workspace runs through `policy.frame()`
 *     directly. Authorising access without it leaves a workspace nobody can see.
 *
 * So the two predicates gain one more way to say yes: an id listed in the shared scope
 * file, which @local/smallpe-user-workspaces rewrites on a timer.
 *
 * SECURITY: this widens access on purpose. Every signed-in user — not only admins — can
 * read and write every file in a shared workspace and drive the agents inside it, model
 * spend included. Nothing else changes: unlisted workspaces and sessions stay private to
 * their owner, and an absent or unreadable scope file means nothing is shared, so the
 * failure direction is closed. The scope lists explicit ids rather than matching a
 * pattern, so what is shared is always auditable:
 *
 *   cat $DSH_HOME/smallpe-shared-scope.json
 *
 * Run by dsh/scripts/enable-auth.sh, so it covers both the local opt-in and the container
 * image. Re-running is safe. Re-run it after any `dsh plugin add dsh-ui-auth`.
 *
 * Usage:  node dsh/scripts/patch-ui-auth-sharing.mjs [path/to/dsh-ui-auth/lib/modern-policy.js]
 */

import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

/** The predicates as dsh-ui-auth emits them, and the shared-aware replacements. */
const REPLACEMENTS = [
  {
    what: 'session',
    from: "const session = (principal, id) => nonempty(id) && (principal.role === 'admin' || owners.session(id) === principal.username);",
    to: "const session = (principal, id) => nonempty(id) && (principal.role === 'admin' || owners.session(id) === principal.username || __smallpeShared().sessions.has(String(id)));",
  },
  {
    what: 'workspace',
    from: "const workspace = (principal, id) => nonempty(id) && (principal.role === 'admin' || owners.workspace(id) === principal.username);",
    to: "const workspace = (principal, id) => nonempty(id) && (principal.role === 'admin' || owners.workspace(id) === principal.username || __smallpeShared().workspaces.has(String(id)));",
  },
]

/**
 * The reader prepended to the module.
 *
 * Deliberately synchronous and self-contained: the predicates it serves are synchronous,
 * and they are on the authorization path for every request, so this must not import
 * anything the module does not already have or do any I/O it cannot bound. `readFileSync`
 * on a small local file behind a one-second cache is the cheapest thing that stays
 * correct when the file changes under a running harness.
 *
 * Every failure — missing file, bad JSON, unreadable — yields empty sets, which is stock
 * dsh-ui-auth behaviour. It can never widen access by accident.
 */
const PRELUDE = `// --- SmallPE: shared workspace scope (dsh/scripts/patch-ui-auth-sharing.mjs) ---------
// Ids listed here are visible to EVERY signed-in user, not just their owner. Written by
// @local/smallpe-user-workspaces; absent or malformed means nothing is shared.
import { readFileSync as __smallpeReadFileSync } from "node:fs";
import __smallpeNodePath from "node:path";
const __smallpeScopeFile = process.env.SMALLPE_SHARED_SCOPE_FILE
	?? __smallpeNodePath.resolve(process.env.DSH_HOME ?? ".", "smallpe-shared-scope.json");
const __smallpeEmptyScope = { workspaces: new Set(), sessions: new Set() };
let __smallpeScope = __smallpeEmptyScope;
let __smallpeScopeReadAt = 0;
function __smallpeShared() {
	const now = Date.now();
	// Re-read at most once a second: this runs on every authorization decision.
	if (now - __smallpeScopeReadAt < 1000) return __smallpeScope;
	__smallpeScopeReadAt = now;
	try {
		const parsed = JSON.parse(__smallpeReadFileSync(__smallpeScopeFile, "utf8"));
		__smallpeScope = {
			workspaces: new Set((Array.isArray(parsed.workspaces) ? parsed.workspaces : []).map(String)),
			sessions: new Set((Array.isArray(parsed.sessions) ? parsed.sessions : []).map(String)),
		};
	} catch {
		// No file yet, or garbage in it: share nothing.
		__smallpeScope = __smallpeEmptyScope;
	}
	return __smallpeScope;
}
// --- end SmallPE -------------------------------------------------------------------

`

const MARKER = '__smallpeShared'

const DEFAULT_TARGET = path.resolve(
  process.env.DSH_HOME ?? path.resolve(import.meta.dirname, '..', 'home'),
  'profiles/web/node_modules/dsh-ui-auth/lib/modern-policy.js',
)

const target = process.argv[2] ?? DEFAULT_TARGET

let source
try {
  source = await readFile(target, 'utf8')
} catch (error) {
  // The plugin is opt-in; skipping is correct when it is absent.
  if (error.code === 'ENOENT') {
    console.log(`[smallpe] dsh-ui-auth is not installed at ${target} — no sharing patch to apply.`)
    process.exit(0)
  }
  throw error
}

if (source.includes(MARKER)) {
  console.log('[smallpe] dsh-ui-auth already shares the SmallPE scope.')
  process.exit(0)
}

const missing = REPLACEMENTS.filter(({ from }) => source.split(from).length - 1 !== 1)
if (missing.length > 0) {
  console.error(
    `[smallpe] patch-ui-auth-sharing: expected exactly one ${missing.map((r) => r.what).join(' and ')} predicate in\n`
    + `          ${target}\n`
    + '          dsh-ui-auth has reworded its policy core. Re-read modern-policy.js and update\n'
    + '          REPLACEMENTS in dsh/scripts/patch-ui-auth-sharing.mjs before trusting the result.\n'
    + '          Refusing to patch: a partial match here would silently change who can see what.',
  )
  process.exit(1)
}

let patched = source
for (const { from, to } of REPLACEMENTS) patched = patched.replace(from, to)
patched = PRELUDE + patched

await writeFile(target, patched)
console.log(`[smallpe] dsh-ui-auth now honours ${path.basename(DEFAULT_TARGET) === path.basename(target) ? 'the SmallPE shared scope' : target} (session + workspace predicates).`)
