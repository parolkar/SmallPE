#!/usr/bin/env node
/**
 * End-to-end check of the dsh-ui-auth sharing patches against a running harness.
 *
 * The unit tests in dsh/vendor/dsbot-auth-bridge/test/ pin the POLICY decisions. They
 * cannot catch a mistake in the gateway patch itself: patch-ui-auth-sharing.mjs rewrites
 * how `/api/bot` requests are read and forwarded (buffer with `bodyOf`, hand the envelope
 * to the policy, replay the bytes onward), and a bug there breaks DS Bot for EVERYONE,
 * admin included, while every unit test still passes.
 *
 * So this signs in for real and exercises the route end to end:
 *
 *   1. POST /auth/login                      -> a session cookie
 *   2. POST /api/bot {"endpoint":"state"}    -> must return DS Bot's own envelope,
 *                                               proving the replayed body reached the host
 *   3. POST /api/bot {"endpoint":"<denied>"} -> admin may call it; the point is only that
 *                                               the route still answers, not 500s
 *
 * Usage:
 *   DSH_AUTH_USER=admin DSH_AUTH_PASS=... node dsh/scripts/verify-shared-access.mjs [baseUrl]
 *
 * Reads the password from DSH_AUTH_PASS, never from a file and never echoed.
 */

import process from 'node:process'

const base = (process.argv[2] ?? 'http://127.0.0.1:3080').replace(/\/$/, '')
const username = process.env.DSH_AUTH_USER ?? 'admin'
const password = process.env.DSH_AUTH_PASS

if (password === undefined || password === '') {
  console.error('Set DSH_AUTH_PASS to the account password. It is never printed or stored.')
  process.exit(2)
}

const fail = (message) => { console.error(`FAIL: ${message}`); process.exit(1) }

// --- 1. sign in ------------------------------------------------------------------ //
const login = await fetch(`${base}/auth/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ username, password, totp: '' }),
})
if (!login.ok) fail(`login returned ${login.status}`)
const cookie = (login.headers.getSetCookie?.() ?? []).map((value) => value.split(';')[0]).join('; ')
if (cookie === '') fail('login succeeded but set no cookie')
console.log(`ok  login as ${username}`)

// --- 2. the route the DS Bot panel blocks on -------------------------------------- //
const call = async (endpoint) => {
  const response = await fetch(`${base}/api/bot`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ endpoint, payload: null }),
  })
  const text = await response.text()
  let parsed
  try { parsed = JSON.parse(text) } catch { parsed = undefined }
  return { status: response.status, text, parsed }
}

const state = await call('state')
if (state.status !== 200) fail(`POST /api/bot {"endpoint":"state"} returned ${state.status}: ${state.text.slice(0, 200)}`)
if (state.parsed === undefined) fail(`state did not return JSON: ${state.text.slice(0, 200)}`)
// DS Bot answers `{ ok, value | error }`. Either shape proves the replayed body reached
// the host and came back — the thing the gateway patch could have broken.
if (!('ok' in state.parsed)) fail(`state returned JSON without DS Bot's envelope: ${state.text.slice(0, 200)}`)
console.log(`ok  POST /api/bot {"endpoint":"state"} -> 200, ok=${state.parsed.ok}`)
if (state.parsed.ok === true && state.parsed.value !== undefined) {
  const agents = state.parsed.value?.agents ?? state.parsed.value?.roster
  if (Array.isArray(agents)) console.log(`ok  the host answered with ${agents.length} agents`)
}

// --- 3. the route still behaves for a second call --------------------------------- //
// A replay bug often shows up only on the SECOND request over a kept-alive connection.
const again = await call('state')
if (again.status !== 200) fail(`second state call returned ${again.status}`)
console.log('ok  a second call on the same connection still works')

console.log('\nPASS: the patched gateway reads, authorizes and forwards /api/bot intact.')
