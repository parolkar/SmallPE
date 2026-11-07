// Per-user workspaces, plus one shared DS Bot workspace for the whole team.
//
// The model
// ---------
// DSH itself has no users: its workspace registry is a flat list of absolute paths
// (dsh/home/storages/workspace.json). dsh-ui-auth is what adds people, and it already
// scopes workspaces per user — every rule in its policy core funnels through two
// predicates:
//
//   const session   = (p, id) => ... (p.role === 'admin' || owners.session(id)   === p.username)
//   const workspace = (p, id) => ... (p.role === 'admin' || owners.workspace(id) === p.username)
//
// What it deliberately does NOT do is create workspaces for people:
//
//   // Workspace creation stays deployment-owned: a path is a host capability, not a user one.
//   return false                                    — dsh-ui-auth/lib/modern-policy.js
//
// That is this plugin's job. For every account dsh-ui-auth knows, it ensures a directory
// exists, registers it with DSH, and claims it for that user. The user then sees exactly
// one workspace of their own, and nobody else's.
//
// The shared half
// ---------------
// SmallPE's nine DS Bot agents are colleagues working in one shared folder, so the team
// workspace must be visible to EVERYONE, not just its owner. dsh-ui-auth's ownership is
// strictly single-owner (`claimOwner` throws "Object already belongs to another user"),
// and the sidebar list arrives over the `workspace/follow` stream whose per-frame
// projection is NOT reachable through `registerPolicy` — only the `http`, `rpc` and
// `upgrade` policy kinds are actually dispatched in 0.7.1; `stream` and `remote` are
// declared but never consulted. So authorising access alone would leave the team
// workspace invisible in the sidebar.
//
// Sharing therefore needs the two predicates above to admit a shared set, which
// dsh/scripts/patch-ui-auth-sharing.mjs adds. That patch reads this file:
//
//   $DSH_HOME/smallpe-shared-scope.json   { "workspaces": [...], "sessions": [...] }
//
// A file rather than a shared object because the patch must behave sanely before this
// plugin has run (absent file -> empty set -> stock per-user behaviour, failing closed),
// and because an operator can read it to see exactly what is shared. This plugin rewrites
// it on every pass, so new agent sessions join the shared set within one interval.
//
// SECURITY: everything named in that file is readable and writable by every signed-in
// user, and they can drive the agents in it (model spend included). That is the point —
// the team folder is shared — but it is a deliberate widening, so the file lists ids
// explicitly rather than matching by pattern.

import { mkdir, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'

export const name = 'smallpe-user-workspaces'

// The registry and the credential store are core services and always present. `uiAuth`
// is not: it arrives only when dsh-ui-auth is installed, and is injected on an inner
// fiber so this entry still activates (and stays silent) on a no-login install.
export const inject = ['credentials', 'workspaceRegistry']

/** dsh-ui-auth keeps every account as a credential record under this prefix. */
const USER_RECORD_PREFIX = 'dsh-auth/'

/** Its own records that are not accounts. */
const RESERVED_RECORDS = new Set(['ownership', 'invites', 'retired-users'])

/**
 * A username safe to use as one directory segment.
 *
 * dsh-ui-auth accepts /^[A-Za-z0-9_.-]{2,32}$/, which admits "..". Joining that to the
 * root would escape it, so the check here is deliberately stricter than theirs: the name
 * must survive a round trip through basename and must not be a relative segment.
 *
 * @param {unknown} username candidate account name
 * @returns {username is string} true when it is safe to join to the workspace root
 */
function isSafeSegment(username) {
  return typeof username === 'string'
    && /^[A-Za-z0-9_][A-Za-z0-9_.-]{1,31}$/.test(username)
    && username !== '..'
    && path.basename(username) === username
}

export function apply(ctx, config = {}) {
  const home = process.env.DSH_HOME ?? '.'
  // Personal workspaces are siblings of the team workspace, never inside it: the team
  // folder is itself a registered workspace that all nine agents work in, so nesting
  // personal folders under it would put every user's files in the agents' shared tree.
  const root = config.root
    ?? process.env.SMALLPE_USER_WORKSPACES_ROOT
    ?? path.resolve(home, '..', '..', 'workspaces')
  const teamPath = config.teamWorkspace ?? process.env.SMALLPE_TEAM_WORKSPACE
  const scopeFile = config.sharedScopeFile ?? path.resolve(home, 'smallpe-shared-scope.json')
  const intervalMs = Number(config.intervalMs ?? process.env.SMALLPE_USER_WORKSPACES_INTERVAL_MS ?? 30_000)

  // Reported once per distinct problem: this loop runs every interval forever, and an
  // unreachable credential store would otherwise fill the log with the same line.
  const reported = new Set()
  const reportOnce = (key, message) => {
    if (reported.has(key)) return
    reported.add(key)
    ctx.logger?.warn?.(message) ?? console.warn(`[smallpe-user-workspaces] ${message}`)
  }

  /**
   * Every account dsh-ui-auth currently holds.
   *
   * Read the same way dsh-ui-auth reads it (`buildStore().load()`): list the credential
   * records, keep the `dsh-auth/` grants whose payload parses as a user record. Going
   * through the store rather than the plugin keeps this working whether or not
   * dsh-ui-auth has finished loading, and it is the only enumeration available — the
   * `uiAuth` service exposes `user(name)` but no listing.
   *
   * @returns {Promise<string[]>} usernames, in no particular order
   */
  async function listUsers(scope) {
    const entries = await scope.credentials.listRecords()
    const users = []
    for (const entry of entries) {
      if (typeof entry.key !== 'string' || !entry.key.startsWith(USER_RECORD_PREFIX)) continue
      const suffix = entry.key.slice(USER_RECORD_PREFIX.length)
      if (RESERVED_RECORDS.has(suffix)) continue
      const record = await scope.credentials.readRecord(entry.key)
      if (record === undefined || record.kind !== 'grant' || typeof record.payload !== 'string') continue
      let payload
      try { payload = JSON.parse(record.payload) } catch { continue }
      // A user record is the one carrying a password hash; `username` may differ from the
      // key, which is hashed for names that are not a plain lowercase slug.
      if (payload === null || typeof payload !== 'object') continue
      if (typeof payload.hash !== 'string' || typeof payload.salt !== 'string') continue
      const username = typeof payload.username === 'string' ? payload.username : suffix
      users.push(username)
    }
    return users
  }

  /**
   * Ensure one user owns a workspace at `<root>/<username>`.
   *
   * Every step is idempotent: mkdir is recursive, `workspaceRegistry.create` returns the
   * existing entity for a canonical path it already holds, and claiming a workspace the
   * user already owns is a no-op.
   *
   * @param {object} scope the uiAuth-injected context (see the note in apply's tail)
   * @param {string} username the account to provision for
   * @returns {Promise<void>}
   */
  async function ensureUserWorkspace(scope, username) {
    const directory = path.join(root, username)
    // DSH registers an existing directory and refuses to create one, so this must come first.
    await mkdir(directory, { recursive: true })
    const workspace = await scope.workspaceRegistry.create(directory, username)
    try {
      await scope.uiAuth.claimWorkspace(workspace.id, username)
    } catch (error) {
      // Someone else already owns it — an operator reassigned it, or a username was
      // reused. Never steal it; say so once and leave it alone.
      reportOnce(
        `claim:${username}`,
        `cannot give ${directory} to "${username}": ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }

  /**
   * Publish the shared scope the patched dsh-ui-auth predicates read.
   *
   * The team workspace is matched by path, not by id: ids are generated per install, the
   * path is what this deployment knows. Its sessions are republished every pass because
   * the agents create new ones as the team works, and a session missing from this list is
   * invisible to everyone except its owner.
   *
   * @returns {Promise<void>}
   */
  async function publishSharedScope(scope) {
    const shared = { workspaces: [], sessions: [] }
    if (teamPath !== undefined) {
      const team = scope.workspaceRegistry.list().find((entry) => entry.path === teamPath)
      if (team === undefined) {
        reportOnce('team', `no workspace is registered at ${teamPath}; the DS Bot team folder will not be shared`)
      } else {
        shared.workspaces.push(team.id)
        shared.sessions.push(...team.sessionIds)
      }
    }
    // Written through a temporary file: the patched predicates re-read this on a timer,
    // and a half-written file would briefly deny access to the whole shared team.
    const temporary = `${scopeFile}.tmp`
    await writeFile(temporary, `${JSON.stringify(shared, null, 2)}\n`)
    await rename(temporary, scopeFile)
  }

  async function reconcile(scope) {
    for (const username of await listUsers(scope)) {
      if (!isSafeSegment(username)) {
        reportOnce(`unsafe:${username}`, `skipping user "${username}": not usable as a directory name`)
        continue
      }
      await ensureUserWorkspace(scope, username)
    }
    await publishSharedScope(scope)
  }

  // Without dsh-ui-auth there are no users and nothing to share, so the whole loop waits
  // for its service rather than running against an install that has no accounts.
  //
  // NOTE: everything above takes the injected `scope` rather than closing over the outer
  // `ctx`. Cordis resolves a service against the fiber that declared it, and `uiAuth` is
  // declared on this inner fiber only — reading `ctx.uiAuth` from the enclosing context
  // throws `cannot get property "uiAuth" without inject`, which during development showed
  // up as a directory created and registered but never claimed.
  ctx.inject(['uiAuth'], (scope) => {
    scope.effect(() => {
      let stopped = false
      const pass = () => {
        if (stopped) return Promise.resolve()
        // Reconciliation is best effort: a failure here must never take the harness down,
        // and the next tick retries from scratch.
        return reconcile(scope).catch((error) => {
          reportOnce('reconcile', `reconcile failed: ${error instanceof Error ? error.message : String(error)}`)
        })
      }
      void pass()
      const timer = setInterval(pass, intervalMs)
      // Nothing here should hold the process open on shutdown.
      timer.unref?.()
      return () => {
        stopped = true
        clearInterval(timer)
      }
    }, `smallpe-user-workspaces: reconcile every ${intervalMs}ms into ${root}`)
  })
}
