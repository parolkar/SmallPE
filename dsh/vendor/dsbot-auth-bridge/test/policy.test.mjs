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

/** Endpoints every signed-in user needs to see the team and work with it. */
const SHARED = ['state', 'agent-session', 'thinking']

/** Roster changes and host software updates: admin only. */
const ADMIN_ONLY = [
  'add-agent', 'remove-agent', 'agent-rename', 'agent-archive', 'agent-adopt',
  'update-check', 'update-install', 'dsh-update-install',
]

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
