/**
 * Unit tests for the DS Bot gateway bridge policy.
 *
 * DS Bot posts every operation to one route and names it in the body, so this policy is
 * the only thing standing between a non-admin and `dsh-update-install`. These tests pin
 * both halves: what the team shares, and what stays with the admin.
 *
 * Run with: node dsh/vendor/dsbot-auth-bridge/test/policy.test.mjs
 */

import assert from 'node:assert/strict'
import test from 'node:test'

import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

import * as bridge from '../index.js'

/** Drive `apply` with a stub context and hand back the policy it registered. */
function registeredPolicy(config) {
  let registered
  const scope = {
    effect: (run) => run(),
    uiAuth: {
      registerPolicy: (_id, rules) => {
        registered = rules
        return () => {}
      },
    },
  }
  bridge.apply({ inject: (_deps, callback) => callback(scope) }, config)
  assert.ok(registered !== undefined, 'apply must register a policy')
  return registered
}

/**
 * Endpoints every signed-in user needs to see the team and work with it.
 * Derived from ds-bot 0.3.1's client (`grep -ohE '\bcall[0-9]*\("[a-zA-Z._/-]+"' client.js`).
 */
const SHARED = [
  'state', 'agent-session', 'thinking',
  'bot-new-part', 'bot-open-part',
  'browser-takeover', 'browser-stop', 'browser-give-back',
  'computer-cursor-wait', 'computer-user-active',
  'learning-answer',
  'earlier', 'exchange', 'exchange-text', 'file-text', 'room-progress',
  'send', 'answer-question', 'view-reply', 'approval-answer',
  'dismiss-question', 'dismiss-view', 'resume', 'btw-delete',
  'side-new', 'side-ask', 'side-cancel', 'side-close',
  'stop-member-work', 'stop-room-work', 'goal-draft', 'goal-control',
  'computer-takeover', 'computer-handback', 'computer-stop', 'computer-hold-answer', 'computer-shot',
]

/** The team's shape, host-wide settings, other people's data and host updates: admin only. */
const ADMIN_ONLY = [
  'add-agent', 'remove-agent', 'agent-rename', 'agent-archive', 'agent-adopt',
  'local-agents', 'local-agent-refresh', 'local-agent-add', 'local-agent-remove', 'local-agent-update',
  'create-bot', 'update-bot', 'duplicate-bot', 'delete-bot', 'set-main', 'set-flags', 'private-release',
  'create-room', 'update-room', 'delete-room', 'team-workspace',
  'folders', 'folder-pick', 'folder-list',
  'avatar-library', 'avatar-import', 'avatar-delete',
  'models', 'efforts', 'providers', 'provider-key', 'provider-add', 'provider-models', 'provider-remove',
  'secret-set', 'secret-allow', 'secret-cancel', 'secret-update', 'secret-delete',
  'connector-connect', 'connector-disconnect', 'connector-retry', 'connector-sign-in-code',
  'connector-cancel', 'connector-client', 'connector-set', 'connector-add', 'connector-remove',
  'connector-import-scan', 'connector-import', 'connector-request-cancel',
  'mail-account-add', 'mail-account-remove', 'mail-rule-set', 'mail-send-answer', 'mail-sign-in-code',
  'im-add', 'im-update', 'im-remove', 'im-pair', 'im-unpair', 'im-chat', 'im-retry',
  'im-login-start', 'im-login-wait',
  'capability-save', 'capability-delete', 'capability-approve', 'bot-capability',
  'schedules', 'schedule-create', 'schedule-delete',
  'memory-view', 'memory-ask', 'memory-forget', 'memory-history', 'memory-restore',
  'usage', 'diagnostics', 'diagnostics-log', 'diagnostics-clear', 'set-prefs', 'repo-stars',
  'computer-set-enabled', 'computer-set-level', 'computer-revoke-app', 'computer-provider-retry',
  'computer-system-status', 'computer-permission', 'computer-allow-foreground', 'computer-app-answer',
  'update-check', 'update-install', 'dsh-update-install',
]

/**
 * Every endpoint the installed ds-bot client posts. The bundle calls the route through
 * more than one minified alias (`call`, `call2`, …); matching `call("` alone saw 22 of
 * ~130 and left `send` unclassified, so non-admins got a 403 on every message to a Bot.
 * Two more are named through a variable (`load("local-agents")`).
 */
function clientEndpoints(source) {
  const called = [...source.matchAll(/\bcall\d*\("([a-zA-Z._/-]+)"/g)].map((m) => m[1])
  const loaded = [...source.matchAll(/\bload\("(local-agent[a-z-]*)"/g)].map((m) => m[1])
  return [...new Set([...called, ...loaded])].sort()
}

const admin = { role: 'admin', username: 'admin' }
const john = { role: 'user', username: 'john' }

test('matches only POST on the DS Bot route', () => {
  const { matches } = registeredPolicy().http
  assert.equal(matches({ method: 'POST', pathname: '/api/bot' }), true)
  assert.equal(matches({ method: 'GET', pathname: '/api/bot' }), false)
  assert.equal(matches({ method: 'POST', pathname: '/api/other' }), false)
})

test('an admin reaches every endpoint', async () => {
  const { authorize } = registeredPolicy().http
  for (const endpoint of [...SHARED, ...ADMIN_ONLY]) {
    assert.equal(await authorize(admin, {}, { endpoint }), true, `admin must reach ${endpoint}`)
  }
})

test('a user reaches the shared endpoints', async () => {
  // Without these the DS Bot panel never finishes loading: `state` is the call the UI
  // blocks on, which is what left non-admins on "Setting up your Main Bot…".
  const { authorize } = registeredPolicy().http
  for (const endpoint of SHARED) {
    assert.equal(await authorize(john, {}, { endpoint }), true, `user must reach ${endpoint}`)
  }
})

test('a user cannot change the roster or update the host', async () => {
  const { authorize } = registeredPolicy().http
  for (const endpoint of ADMIN_ONLY) {
    assert.equal(await authorize(john, {}, { endpoint }), false, `user must NOT reach ${endpoint}`)
  }
})

test('anything other than a known shared endpoint is denied', async () => {
  const { authorize } = registeredPolicy().http
  // An unpatched gateway supplies no envelope at all. Falling back to admin-only is the
  // safe direction: the roster must not open up just because the body was unavailable.
  assert.equal(await authorize(john, {}, undefined), false, 'no envelope')
  assert.equal(await authorize(admin, {}, undefined), true, 'no envelope still admits admin')
  assert.equal(await authorize(john, {}, {}), false, 'envelope without an endpoint')
  assert.equal(await authorize(john, {}, { endpoint: 42 }), false, 'non-string endpoint')
  assert.equal(await authorize(john, {}, { endpoint: 'made-up' }), false, 'unknown endpoint')
  assert.equal(await authorize(undefined, {}, { endpoint: 'state' }), false, 'no principal')
  assert.equal(await authorize({ role: 'user' }, {}, { endpoint: 'state' }), false, 'no username')
})

test('the shared set is configurable', () => {
  const { authorize } = registeredPolicy({ sharedEndpoints: ['state'] }).http
  assert.equal(authorize(john, {}, { endpoint: 'state' }), true)
  assert.equal(authorize(john, {}, { endpoint: 'agent-session' }), false)
})

test('every endpoint ds-bot serves is classified', () => {
  // The upgrade hazard: a new ds-bot release adds endpoints, they fall through to
  // admin-only, and the feature silently does nothing for everyone else. This asserts the
  // two lists together cover exactly what the installed client calls, so the next bump
  // fails here instead of in front of a user.
  const client = path.resolve(
    process.env.DSH_HOME ?? path.resolve(import.meta.dirname, '../../../home'),
    'profiles/web/node_modules/ds-bot/client.js',
  )
  if (!existsSync(client)) { console.log('# ds-bot not installed — skipping'); return }
  const served = clientEndpoints(readFileSync(client, 'utf8'))
  const classified = new Set([...SHARED, ...ADMIN_ONLY])
  const unclassified = served.filter((e) => !classified.has(e))
  assert.deepEqual(unclassified, [], `unclassified ds-bot endpoints: ${unclassified.join(', ')}`)
})

test('the endpoint scan sees every minified alias of the client call', () => {
  // ds-bot 0.3.1 posts most operations through `call2`; a scan for `call("` alone missed
  // them, `send` among them.
  const source = 'call("state"); call2("send", { text }); call12("side-ask"); recall("no"); load("local-agents")'
  assert.deepEqual(clientEndpoints(source), ['local-agents', 'send', 'side-ask', 'state'])
})

test('a user can send a message to a Bot', async () => {
  // The regression behind non-admins' 403 on every chat message.
  const { authorize } = registeredPolicy().http
  assert.equal(await authorize(john, {}, { endpoint: 'send', payload: { sessionId: 'b1', text: 'hi' } }), true)
})
