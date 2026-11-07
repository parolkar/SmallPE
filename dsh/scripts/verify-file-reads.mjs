#!/usr/bin/env node
/**
 * Prove the dsh-ui-auth gateway forwards binary file reads byte-for-byte.
 *
 * Regression guard for the sidebar file viewer's
 *   transport failure for /api/workspaceFiles/readBytes: HTTP 502
 * DSH answers multipart/form-data whenever a result carries bytes; the gateway used to
 * JSON.parse every RPC response and died on the boundary prefix. See
 * dsh/scripts/patch-ui-auth-sharing.mjs (binary response pass-through).
 *
 * Usage:
 *   SCOPE=<an agent sessionId> ADMIN_PASS=... JOHN_PASS=... \
 *     node dsh/scripts/verify-file-reads.mjs
 * Needs the two probe files this repo's test flow creates under thesis-development/.
 *
 * The patch stops re-serialising multipart responses and therefore keeps their framing
 * headers. That is only correct if the bytes really are untouched, so compare what the
 * API returns against the file on disk.
 */
import { readFileSync } from 'node:fs'

const BASE = process.env.BASE ?? 'http://127.0.0.1:3080'
const SCOPE = process.env.SCOPE
const files = [
  ['thesis-development/probe.pdf', 'agentic-team-for-private-equity/thesis-development/probe.pdf'],
  ['thesis-development/probe.md', 'agentic-team-for-private-equity/thesis-development/probe.md'],
]

const login = async (username, password) => {
  const r = await fetch(`${BASE}/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password, totp: '' }),
  })
  if (!r.ok) throw new Error(`${username} login ${r.status}`)
  return (r.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ')
}

let seq = 0
const readBytes = async (cookie, path) => {
  const method = 'workspaceFiles/readBytes'
  const r = await fetch(`${BASE}/api/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({
      type: 'client-request', method, rpcId: `int-${++seq}`,
      payload: { args: { workspaceFileScopeId: SCOPE, path, options: {} } },
    }),
  })
  const type = r.headers.get('content-type') ?? ''
  const buf = Buffer.from(await r.arrayBuffer())
  return { status: r.status, type, buf, length: r.headers.get('content-length') }
}

let bad = 0
for (const [who, pass] of [['admin', process.env.ADMIN_PASS], ['john', process.env.JOHN_PASS ?? 'Testing@1234']]) {
  const cookie = await login(who, pass)
  for (const [rel, onDisk] of files) {
    const { status, type, buf, length } = await readBytes(cookie, rel)
    const expected = readFileSync(onDisk)
    // The payload is multipart; the file's bytes must appear in it verbatim.
    const contains = buf.includes(expected)
    const lengthOk = length === null || Number(length) === buf.length
    const ok = status === 200 && type.startsWith('multipart/form-data') && contains && lengthOk
    if (!ok) bad++
    console.log(
      `${ok ? 'PASS' : 'FAIL'}  ${who.padEnd(5)} ${rel.split('/').pop().padEnd(10)}`
      + ` status=${status} type=${type.split(';')[0]} bytes=${buf.length}`
      + ` content-length=${length ?? '(none)'} intact=${contains}`,
    )
  }
}
console.log(bad === 0 ? '\nALL BYTE-INTEGRITY CHECKS PASSED' : `\n${bad} CHECK(S) FAILED`)
process.exit(bad === 0 ? 0 : 1)
