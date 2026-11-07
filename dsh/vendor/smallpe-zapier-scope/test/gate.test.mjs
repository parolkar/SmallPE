/**
 * The ownership gate is the whole security boundary of this plugin, so it is tested
 * directly: tool names are global in DSH and every session can see every user's Zapier
 * tools, which is only safe because calling one does nothing unless you own it.
 *
 * Run with: node dsh/vendor/smallpe-zapier-scope/test/gate.test.mjs
 */

import assert from 'node:assert/strict'
import test from 'node:test'

import * as mod from '../index.js'
const { gateDefinition, isUsableUsername, tokenRefFor } = mod

/** A uiAuth stand-in with a fixed session -> owner map. */
const auth = {
  ownerOfSession: (id) => ({
    'session-john': 'john',
    'session-mary': 'mary',
    'session-agent': 'admin',
  })[id] ?? 'admin',
}

/** The definition the MCP client would have registered. */
const underlying = {
  name: 'mcp__zapier_john__gmail_send_email',
  execute: async () => 'SENT',
}

const callAs = (sessionId) =>
  gateDefinition(underlying, 'john', auth).execute({}, { agent: { session: { id: sessionId } } })

test("the owner's own session can execute", async () => {
  assert.equal(await callAs('session-john'), 'SENT')
})

test("another user's session cannot execute", async () => {
  // The requirement in one line: mary must never act with john's Zapier token.
  await assert.rejects(() => callAs('session-mary'), /belongs to mary/)
})

test('a shared agent session cannot execute a personal connection', async () => {
  // The nine DS Bots are owned by admin and shared with everyone, so a call from one
  // carries no evidence of who prompted it. A personal credential must not run there.
  await assert.rejects(() => callAs('session-agent'), /belongs to admin/)
})

test('an unidentifiable caller cannot execute', async () => {
  const gated = gateDefinition(underlying, 'john', auth)
  await assert.rejects(() => gated.execute({}, {}), /could not be identified/)
  await assert.rejects(() => gated.execute({}, undefined), /could not be identified/)
  await assert.rejects(
    () => gated.execute({}, { agent: { session: { id: '' } } }),
    /could not be identified/,
  )
})

test('the gate preserves everything else about the definition', () => {
  const gated = gateDefinition({ ...underlying, description: 'd', parameters: { a: 1 } }, 'john', auth)
  assert.equal(gated.name, underlying.name)
  assert.equal(gated.description, 'd')
  assert.deepEqual(gated.parameters, { a: 1 })
  assert.notEqual(gated.execute, underlying.execute, 'execute must be wrapped')
})

test('agent.id is accepted when session.id is absent', async () => {
  const gated = gateDefinition(underlying, 'john', auth)
  assert.equal(await gated.execute({}, { agent: { id: 'session-john' } }), 'SENT')
})

test('token references are per user', () => {
  assert.equal(tokenRefFor('john'), 'ZAPIER_MCP_TOKEN__john')
  assert.notEqual(tokenRefFor('john'), tokenRefFor('mary'))
})

test('usernames that would make a bad reference are rejected', () => {
  for (const ok of ['john', 'Mary_2', 'a1']) assert.equal(isUsableUsername(ok), true, ok)
  for (const bad of ['..', 'a', '', 'jo.hn', 'jo-hn', 'x'.repeat(33), null, undefined]) {
    assert.equal(isUsableUsername(bad), false, String(bad))
  }
})

/* -------------------------------------------------------------------------- *
 * The credentials policy: a user may write their own token reference only.
 * -------------------------------------------------------------------------- */

/** Drive apply() with a stub context and return the rpc rule it registered. */
function credentialsRule() {
  let rules
  const scope = {
    effect: (run) => run(),
    uiAuth: { registerPolicy: (_id, r) => { rules = r; return () => {} } },
    credentials: {}, tools: {}, plugin: () => {},
  }
  mod.apply({ inject: (_d, cb) => cb(scope), logger: { warn() {} } })
  assert.ok(rules?.rpc, 'an rpc rule must be registered')
  return rules.rpc
}

test('the policy covers exactly the credential write endpoints', () => {
  const { matches } = credentialsRule()
  assert.equal(matches('credentials/set'), true)
  assert.equal(matches('credentials/unset'), true)
  assert.equal(matches('credentials/describe'), false)
  assert.equal(matches('settings/mutate'), false)
})

test('a user may write only their own token reference', () => {
  const { authorize } = credentialsRule()
  const john = { username: 'john', role: 'user' }
  assert.equal(authorize(john, { args: { ref: 'ZAPIER_MCP_TOKEN__john' } }), true)
  // The requirement, at the write side: john must not touch mary's credential.
  assert.equal(authorize(john, { args: { ref: 'ZAPIER_MCP_TOKEN__mary' } }), false)
  // Nor the firm-wide one, nor anything else in the store.
  assert.equal(authorize(john, { args: { ref: 'ZAPIER_MCP_TOKEN' } }), false)
  assert.equal(authorize(john, { args: { ref: 'OPENROUTER_API_KEY' } }), false)
  assert.equal(authorize(john, { args: {} }), false)
  assert.equal(authorize(john, {}), false)
})

test('an administrator keeps the access they had, and anonymity is refused', () => {
  const { authorize } = credentialsRule()
  assert.equal(authorize({ username: 'admin', role: 'admin' }, { args: { ref: 'ANYTHING' } }), true)
  assert.equal(authorize(undefined, { args: { ref: 'ZAPIER_MCP_TOKEN__john' } }), false)
  assert.equal(authorize({ role: 'user' }, { args: { ref: 'ZAPIER_MCP_TOKEN__john' } }), false)
})

test('the policy projects results unchanged', () => {
  const { project } = credentialsRule()
  assert.deepEqual(project({ username: 'john' }, { ok: true }), { ok: true })
})
