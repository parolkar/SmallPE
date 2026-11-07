// Per-user Zapier MCP: each signed-in user acts with their OWN Zapier token.
//
// The problem
// -----------
// dsh-zapier-mcp is single-tenant by construction. One row carries one
// `credentialRef`, the token is baked into the connect URL once
// (`buildServerUrl(endpoint, token)`), and the resulting tools are registered on the
// ROOT context — so `mcp__zapier__*` exists in every session, and whoever set the token
// is who every agent acts as. With dsh-ui-auth and several people signed in, that means
// one user's work runs against another user's Zapier account.
//
// What this adds
// --------------
// For every user who has stored a token of their own, one additional MCP connection,
// named `zapier_<username>`, so their tools arrive as `mcp__zapier_<username>__*`. The
// firm-wide row stays exactly as it was and keeps serving the shared DS Bot agents with
// the team token — a deliberate, documented firm credential, not a person's.
//
// The security boundary is EXECUTION, not visibility
// --------------------------------------------------
// Tool names are global in DSH; there is no per-session registration seam, so every
// session can *see* every user's tool names. What matters is that calling one does
// nothing unless you are its owner. Each per-user connection is mounted beneath a fiber
// that shadows the `tools` service with a wrapper, so the MCP client's own
// `ctx.tools.register(...)` passes through us and every `execute` is gated on
//
//   uiAuth.ownerOfSession(exec.agent.session.id) === <the token's owner>
//
// Verified against real cordis: a child fiber providing its own `tools` service does
// intercept a plugin mounted beneath it, while the tool still lands on the real service
// so agents can call it.
//
// Why the shared agents are not covered by this
// ---------------------------------------------
// The nine DS Bots are shared colleagues: their sessions are owned by `admin` (unclaimed)
// and made visible to everyone by the sharing patch. When a user drives one of them, the
// MCP call executes inside a session that is not theirs, so there is no per-user identity
// to resolve — `ownerOfSession` answers `admin` no matter who prompted. Per-user tokens
// and shared agents are mutually exclusive for that reason, which is why the shared
// agents deliberately keep the firm's team token instead. Anything claiming to scope a
// shared agent to the prompting user would be security theatre.
//
// Without dsh-ui-auth this plugin does nothing at all: there are no users, and the stock
// single-token behaviour is correct.

import path from 'node:path'

export const name = 'smallpe-zapier-scope'

export const inject = ['credentials', 'tools']

/** Where a user's own token lives: one credential per user. */
export const tokenRefFor = (username) => `ZAPIER_MCP_TOKEN__${username}`

/** dsh-ui-auth keeps every account as a credential record under this prefix. */
const USER_RECORD_PREFIX = 'dsh-auth/'
const RESERVED_RECORDS = new Set(['ownership', 'invites', 'retired-users'])

/**
 * A username usable in a credential reference and an MCP server name.
 *
 * Deliberately stricter than dsh-ui-auth's own `[A-Za-z0-9_.-]{2,32}`: dots and dashes
 * are fine in an account name but make for awkward tool names, and `..` would be an
 * actively bad reference. Anything rejected here simply gets no personal connection,
 * reported once, rather than a silently mangled one.
 *
 * @param {unknown} username candidate account name
 * @returns {username is string} true when it is safe to build a ref and server name from
 */
export function isUsableUsername(username) {
  return typeof username === 'string' && /^[A-Za-z0-9_][A-Za-z0-9_]{1,31}$/.test(username)
}

/**
 * Wrap one MCP tool definition so only its owner's sessions can execute it.
 *
 * @param {object} definition the definition the MCP client registered
 * @param {string} owner the username whose token backs this connection
 * @param {{ ownerOfSession(id: string): string }} auth the uiAuth seam
 * @returns {object} the same definition with a gated `execute`
 */
export function gateDefinition(definition, owner, auth) {
  return {
    ...definition,
    execute: async (args, exec) => {
      // `agent.id` and `session.id` are the same value in DSH; read the session for clarity.
      const sessionId = exec?.agent?.session?.id ?? exec?.agent?.id
      // Fail closed. No identifiable caller means no call: a tool backed by somebody's
      // personal credential must never run on an unattributable session.
      if (typeof sessionId !== 'string' || sessionId === '') {
        throw new Error(
          `Zapier (${owner}): refusing to run — this tool uses ${owner}'s personal Zapier `
          + 'token and the calling session could not be identified.',
        )
      }
      const caller = auth.ownerOfSession(sessionId)
      if (caller !== owner) {
        throw new Error(
          `Zapier (${owner}): refusing to run — this tool uses ${owner}'s personal Zapier `
          + `token, and this session belongs to ${caller}. Store your own token in `
          + 'Settings → Zapier MCP and use your own mcp__zapier_<you>__* tools, or use the '
          + 'firm-wide mcp__zapier__* tools.',
        )
      }
      return definition.execute(args, exec)
    },
  }
}

/**
 * The fiber that shadows `tools` for one user's MCP connection.
 *
 * Mounted between this plugin and the MCP client so that the client's own
 * `ctx.tools.register(definition)` reaches `register` below instead of the real service.
 * Registrations are forwarded to the real service — the tools must exist for agents to
 * call them — but with the ownership gate wrapped around `execute`.
 */
function scopedToolsPlugin(ctx, config) {
  const { owner, auth, realTools } = config
  ctx.provide('tools', {
    ...realTools,
    register: (definition) => realTools.register(gateDefinition(definition, owner, auth)),
  })
}

export function apply(ctx, config = {}) {
  const endpoint = config.endpoint ?? 'https://mcp.zapier.com/api/v1/connect'
  const intervalMs = Number(config.intervalMs ?? process.env.SMALLPE_ZAPIER_SCOPE_INTERVAL_MS ?? 30_000)
  const toolCallTimeoutMs = Number(config.toolCallTimeoutMs ?? 120_000)

  const reported = new Set()
  const reportOnce = (key, message) => {
    if (reported.has(key)) return
    reported.add(key)
    ctx.logger?.warn?.(message) ?? console.warn(`[smallpe-zapier-scope] ${message}`)
  }

  /** username -> { fiber, token } for every personal connection currently mounted. */
  const mounted = new Map()

  /**
   * Every account dsh-ui-auth holds, read the same way it reads them itself.
   * @param {object} scope the uiAuth-injected context
   * @returns {Promise<string[]>} usernames
   */
  async function listUsers(scope) {
    const users = []
    for (const entry of await scope.credentials.listRecords()) {
      if (typeof entry.key !== 'string' || !entry.key.startsWith(USER_RECORD_PREFIX)) continue
      const suffix = entry.key.slice(USER_RECORD_PREFIX.length)
      if (RESERVED_RECORDS.has(suffix)) continue
      const record = await scope.credentials.readRecord(entry.key)
      if (record === undefined || record.kind !== 'grant' || typeof record.payload !== 'string') continue
      let payload
      try { payload = JSON.parse(record.payload) } catch { continue }
      if (payload === null || typeof payload !== 'object') continue
      if (typeof payload.hash !== 'string' || typeof payload.salt !== 'string') continue
      users.push(typeof payload.username === 'string' ? payload.username : suffix)
    }
    return users
  }

  /**
   * Bring one user's personal connection in line with their stored token.
   *
   * Remounts when the token changes, so a rotated token takes effect within one pass and
   * a removed one takes the tools away with it.
   *
   * @param {object} scope the uiAuth-injected context
   * @param {string} username the account to reconcile
   * @returns {Promise<void>}
   */
  async function reconcileUser(scope, username) {
    const token = await scope.credentials.resolve(tokenRefFor(username))
    const current = mounted.get(username)
    const wanted = typeof token === 'string' && token.trim() !== '' ? token : undefined

    if (wanted === undefined) {
      if (current !== undefined) {
        await current.fiber?.dispose?.()
        mounted.delete(username)
      }
      return
    }
    if (current !== undefined && current.token === wanted) return
    if (current !== undefined) {
      await current.fiber?.dispose?.()
      mounted.delete(username)
    }

    const { buildServerUrl } = await import('dsh-zapier-mcp/lib/host-logic.js')
    const mcp = await import('@deepseek-ai/dsh-mcp-client')
    // One fiber per user: it shadows `tools`, then mounts the MCP client beneath itself so
    // the client's registrations pass through the ownership gate.
    const fiber = scope.plugin({
      name: `smallpe-zapier-scope:${username}`,
      inject: ['tools'],
      apply: (scoped) => {
        scopedToolsPlugin(scoped, { owner: username, auth: scope.uiAuth, realTools: scope.tools })
        scoped.plugin(
          { name: mcp.name, inject: mcp.inject, Config: mcp.Config, apply: mcp.apply },
          {
            serverName: `zapier_${username}`,
            transport: 'streamable-http',
            url: buildServerUrl(endpoint, wanted),
            toolCallTimeoutMs,
            // Never fail the harness over one user's bad token; the others must keep working.
            failOnStartupError: false,
            reconnect: { enabled: true },
          },
        )
      },
    })
    mounted.set(username, { fiber, token: wanted })
  }

  async function reconcile(scope) {
    const users = await listUsers(scope)
    const known = new Set()
    for (const username of users) {
      if (!isUsableUsername(username)) {
        reportOnce(`unusable:${username}`, `no personal Zapier connection for "${username}": name is not usable as a credential reference`)
        continue
      }
      known.add(username)
      await reconcileUser(scope, username)
    }
    // A deleted account must not keep a live connection to its Zapier workspace.
    for (const username of [...mounted.keys()]) {
      if (known.has(username)) continue
      await mounted.get(username)?.fiber?.dispose?.()
      mounted.delete(username)
    }
  }

  // No dsh-ui-auth means no users, and the stock single-token row is already correct.
  ctx.inject(['uiAuth'], (scope) => {
    // Let a user store their OWN token, and nobody else's.
    //
    // dsh-ui-auth keeps `credentials/*` administrator-only, which would leave users
    // unable to supply the very token this plugin scopes to them. This rule is the
    // narrowest widening that fixes that: an administrator keeps the behaviour they had,
    // and anyone else may write exactly one reference — the one named after them.
    //
    // Registering an `rpc` rule REPLACES the built-in decision for these endpoints, so it
    // must also carry `project`. Nothing is projected away: set/unset answer with a
    // success envelope, never with a secret.
    scope.effect(() => scope.uiAuth.registerPolicy('smallpe-zapier-scope', {
      rpc: {
        matches: (endpoint) => endpoint === 'credentials/set' || endpoint === 'credentials/unset',
        authorize: (principal, payload) => {
          if (typeof principal?.username !== 'string') return false
          if (principal.role === 'admin') return true
          const ref = payload?.args?.ref
          return typeof ref === 'string' && ref === tokenRefFor(principal.username)
        },
        project: (_principal, value) => value,
      },
    }), 'smallpe-zapier-scope: a user may write only their own Zapier token')

    scope.effect(() => {
      let stopped = false
      const pass = () => {
        if (stopped) return Promise.resolve()
        return reconcile(scope).catch((error) => {
          reportOnce('reconcile', `reconcile failed: ${error instanceof Error ? error.message : String(error)}`)
        })
      }
      void pass()
      const timer = setInterval(pass, intervalMs)
      timer.unref?.()
      return () => {
        stopped = true
        clearInterval(timer)
        for (const entry of mounted.values()) void entry.fiber?.dispose?.()
        mounted.clear()
      }
    }, `smallpe-zapier-scope: per-user Zapier connections, every ${intervalMs}ms`)
  })
}
