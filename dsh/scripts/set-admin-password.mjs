#!/usr/bin/env node
/**
 * Give the first admin account the password the deployer chose, so nobody has to dig the
 * one-time password out of the logs.
 *
 * Why this exists
 * ---------------
 * On a fresh harness home dsh-ui-auth creates an `admin` account with a random password,
 * prints it to the log in Chinese and writes it to dsh-ui-auth-bootstrap.txt in the
 * workspace. It has no setting for choosing that password. So when SMALLPE_ADMIN_PASSWORD is
 * set, this signs in with the one-time password and changes it through dsh-ui-auth's own
 * change-password call — the same one Settings → User management uses — which also deletes
 * the bootstrap file.
 *
 * It only ever replaces the one-time password: once the bootstrap file is gone (the password
 * was changed here or in the UI), it does nothing, so a password changed in the UI is never
 * overwritten by a redeploy. The password is never logged.
 *
 * Run in the background by bin/container-start.sh once the harness is starting.
 *
 * Usage:  SMALLPE_ADMIN_PASSWORD=… node dsh/scripts/set-admin-password.mjs <bootstrap-file>
 */

import { existsSync, readFileSync } from 'node:fs'

const bootstrapFile = process.argv[2]
const password = process.env.SMALLPE_ADMIN_PASSWORD ?? ''
const base = `http://127.0.0.1:${process.env.DSH_PORT || 3080}`
const say = (message) => console.log(`[smallpe] ${message}`)
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** dsh-ui-auth's own rule (passwordError): 8–128 characters, at least two of a-z A-Z 0-9 symbol. */
function policyError(value) {
  if (value.length < 8) return 'it is shorter than 8 characters'
  if (value.length > 128) return 'it is longer than 128 characters'
  const kinds = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^a-zA-Z0-9]/].filter((re) => re.test(value)).length
  if (kinds < 2) return 'it needs at least two of: lower-case, upper-case, digits, symbols'
  return null
}

async function main() {
  if (password === '') return
  const problem = policyError(password)
  if (problem !== null) {
    say(`SMALLPE_ADMIN_PASSWORD was not applied: ${problem}. The admin keeps the one-time password from the log.`)
    return
  }

  // Wait for the harness to answer and for dsh-ui-auth to have decided whether it needed
  // to create the admin (it writes the bootstrap file right after printing the password).
  let ready = false
  for (let attempt = 0; attempt < 180 && !ready; attempt++) {
    try {
      ready = (await fetch(`${base}/auth/login`)).ok
    } catch {}
    if (!ready) await sleep(1000)
  }
  if (!ready) {
    say('SMALLPE_ADMIN_PASSWORD was not applied: the harness did not come up within 3 minutes.')
    return
  }
  await sleep(2000)
  if (!existsSync(bootstrapFile)) return // the one-time password was already changed

  const oneTime = /^密码:\s*(.+)$/m.exec(readFileSync(bootstrapFile, 'utf8'))?.[1]?.trim()
  if (!oneTime) {
    say('SMALLPE_ADMIN_PASSWORD was not applied: the one-time password file has an unexpected format.')
    return
  }

  const headers = { 'content-type': 'application/json', origin: base }
  const login = await fetch(`${base}/auth/login`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ username: 'admin', password: oneTime }),
  })
  const cookie = (login.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ')
  if (!login.ok || cookie === '') {
    say(`SMALLPE_ADMIN_PASSWORD was not applied: signing in with the one-time password failed (HTTP ${login.status}).`)
    return
  }

  const change = await fetch(`${base}/auth/rpc/changePassword`, {
    method: 'POST',
    headers: { ...headers, cookie },
    body: JSON.stringify({ oldPassword: oneTime, newPassword: password }),
  })
  if (!change.ok) {
    say(`SMALLPE_ADMIN_PASSWORD was not applied: the password change was refused (HTTP ${change.status}).`)
    return
  }
  say('admin password set from SMALLPE_ADMIN_PASSWORD. Change it any time under Classic mode → Settings → User management.')
}

main().catch((error) => say(`SMALLPE_ADMIN_PASSWORD was not applied: ${error.message}`))
