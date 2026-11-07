/**
 * Behaviour tests for the dsh-ui-auth patches applied by
 * dsh/scripts/patch-ui-auth-sharing.mjs.
 *
 * These drive the PATCHED copy in the profile, so they only run where dsh-ui-auth is
 * installed (`./dsh/scripts/enable-auth.sh`). Without it the suite skips rather than
 * fails: the no-login install is a supported configuration.
 *
 * Run with: node dsh/vendor/dsbot-auth-bridge/test/entitlement.test.mjs
 */

import assert from 'node:assert/strict'
import test from 'node:test'
import { existsSync } from 'node:fs'
import path from 'node:path'

const POLICY = path.resolve(
  process.env.DSH_HOME ?? path.resolve(import.meta.dirname, '../../../home'),
  'profiles/web/node_modules/dsh-ui-auth/lib/modern-policy.js',
)

if (!existsSync(POLICY)) {
  console.log(`# dsh-ui-auth is not installed (${POLICY}) — skipping.`)
  process.exit(0)
}

// Point the shared-scope reader at a path that does not exist, so these tests exercise
// the model entitlement alone and never depend on a live scope file.
process.env.SMALLPE_SHARED_SCOPE_FILE = '/nonexistent/smallpe-scope.json'

const { createModernPolicy } = await import(POLICY)

const owners = { session: () => 'john', workspace: () => 'john' }
const john = { username: 'john', role: 'user' }

/**
 * Ask the policy whether john may switch a session to this provider/model.
 *
 * The payload is the Remote envelope shape `remoteArgs` insists on: exactly one key,
 * `args`, holding the request object. Anything else is rejected before the model rules
 * are reached, which silently turns every assertion into a false negative.
 */
const select = (policy, provider, model) =>
  policy.authorize(john, 'session/selectModel', { args: { sessionId: 's1', provider, model } })

test('a deployment route with no model entries serves every model', async () => {
  // This is the SmallPE case: OpenRouter is configured once in cordis.patch.yml, so the
  // route is granted to everyone but no per-model profile exists to enumerate.
  const policy = createModernPolicy(owners, {
    entitlement: () => ({ providers: ['openrouter'], models: [] }),
  })
  assert.equal(await select(policy, 'openrouter', 'deepseek/deepseek-v4.1-flash'), true)
  assert.equal(await select(policy, 'openrouter', 'anthropic/claude-opus-5.5'), true)
  assert.equal(await select(policy, 'some-other-route', 'x'), false, 'routes not granted stay denied')
})

test('a profile-backed route still matches model by model', async () => {
  // The patch must not loosen the case dsh-ui-auth already handled: a user's own profile
  // (or one shared with them) authorizes exactly its own model, nothing else on that route.
  const policy = createModernPolicy(owners, {
    entitlement: () => ({ providers: ['p-abc'], models: [{ provider: 'p-abc', model: 'gpt-x' }] }),
  })
  assert.equal(await select(policy, 'p-abc', 'gpt-x'), true)
  assert.equal(await select(policy, 'p-abc', 'something-else'), false)
})

test('deployment and profile routes coexist with their own rules', async () => {
  const policy = createModernPolicy(owners, {
    entitlement: () => ({
      providers: ['openrouter', 'p-abc'],
      models: [{ provider: 'p-abc', model: 'gpt-x' }],
    }),
  })
  assert.equal(await select(policy, 'openrouter', 'anything/at-all'), true, 'deployment route is open')
  assert.equal(await select(policy, 'p-abc', 'gpt-x'), true)
  assert.equal(await select(policy, 'p-abc', 'other'), false, 'profile route stays strict')
})

test('no entitlement configured leaves stock behaviour untouched', async () => {
  const policy = createModernPolicy(owners, {})
  assert.equal(await select(policy, 'anything', 'anything'), true)
})

test('an empty entitlement still denies everything', async () => {
  // The deny-by-default the patch must preserve when SMALLPE_DEFAULT_PROVIDERS is unset:
  // a user with no profiles and no deployment routes runs nothing.
  const policy = createModernPolicy(owners, {
    entitlement: () => ({ providers: [], models: [] }),
  })
  assert.equal(await select(policy, 'openrouter', 'deepseek/deepseek-v4.1-flash'), false)
})
