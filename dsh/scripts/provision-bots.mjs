#!/usr/bin/env node
/**
 * Provision the SmallPE agent roster into DS Bot.
 *
 * Why this exists
 * ---------------
 * A DS Bot agent's `id` *is* the Session id of its first own chat, and a missing
 * Session is a hard error rather than a fresh start. The roster therefore cannot be
 * shipped as a static `state.json` (its ids would only be valid alongside the author's
 * private session transcripts, which must never be distributed). Instead we ship a
 * declarative seed (`templates/bots.seed.json`) and recreate the agents here through
 * the same HTTP route the DS Bot web UI uses, so every id is real by construction and
 * no transcript, memory or secret leaves the author's machine.
 *
 * What it does
 * ------------
 *   1. starts the local DSH web app on a private loopback port
 *   2. exchanges that process's launch token for an API credential (GET /connect)
 *   3. creates one agent per entry in the seed, with its own working folder
 *   4. promotes the seeded main agent and removes the auto-created placeholder
 *
 * Authentication note: DSH binds every request to a per-process launch token, shown
 * in the startup URL as `?token=...`. A browser exchanges it by loading the root URL;
 * an API client exchanges it at `GET /connect?token=...&interactions=none`, which
 * returns a signed session cookie. That is what this script does, so it never needs a
 * login and never has to weaken the profile's security.
 *
 * It is safe to re-run: agents that already exist (matched by name) are left alone.
 * Use --force to also re-apply roles/instructions to existing agents.
 *
 * Usage:  node scripts/provision-bots.mjs [--force] [--port N]
 */

import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, readFile } from 'node:fs/promises'
import net from 'node:net'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const DSH_DIR = resolve(HERE, '..')
const ROOT = resolve(DSH_DIR, '..')

// The harness home is always inside this repository and is never inherited.
// A nested DSH session exports DSH_HOME pointing at the caller's personal ~/.dsh;
// honouring it here would provision SmallPE's agents into someone else's team.
const DSH_HOME = process.env.SMALLPE_DSH_HOME ?? join(DSH_DIR, 'home')
if (!DSH_HOME.startsWith(ROOT + '/')) {
  console.error(
    '[smallpe] ERROR: refusing to provision — the harness home is outside the repository.\n' +
      `  harness home: ${DSH_HOME}\n  repository  : ${ROOT}`,
  )
  process.exit(1)
}
const TEAM_WORKSPACE =
  process.env.SMALLPE_TEAM_WORKSPACE ?? join(ROOT, 'agentic-team-for-private-equity')

const DSH_BIN = join(DSH_DIR, 'node_modules', '.bin', 'dsh')
const SEED_PATH = join(DSH_DIR, 'templates', 'bots.seed.json')
const STATE_PATH = join(DSH_HOME, 'bot', 'state.json')

/** Names DS Bot itself creates on an empty team; removed if they are not in our seed. */
const BOOTSTRAP_PLACEHOLDER_NAMES = new Set(['Chief', 'Main Bot'])

const argv = process.argv.slice(2)
const FORCE = argv.includes('--force')
const portArg = argv.indexOf('--port')
const REQUESTED_PORT = portArg === -1 ? undefined : Number(argv[portArg + 1])

const log = (...args) => console.log('[smallpe]', ...args)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function freePort() {
  return new Promise((resolvePort, rejectPort) => {
    const server = net.createServer()
    server.unref()
    server.on('error', rejectPort)
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address()
      server.close(() => resolvePort(port))
    })
  })
}

/** The per-process launch token, read out of the child's startup banner. */
class Launcher {
  constructor() {
    this.launchToken = undefined
    this.log = []
  }

  attach(child) {
    const absorb = (chunk) => {
      const text = String(chunk)
      this.log.push(text)
      if (this.launchToken === undefined) {
        const found = /[?&]token=([A-Za-z0-9._~-]+)/.exec(text)
        if (found) this.launchToken = found[1]
      }
    }
    child.stdout.on('data', absorb)
    child.stderr.on('data', absorb)
  }

  tail(lines = 15) {
    return this.log.join('').trim().split('\n').slice(-lines).join('\n')
  }
}

/**
 * Exchange the launch token for a signed API credential cookie.
 * Returns the `name=value` pair to send on later requests.
 */
async function exchangeToken(port, token) {
  const response = await fetch(
    `http://127.0.0.1:${port}/connect?token=${encodeURIComponent(token)}&interactions=none`,
    { redirect: 'manual' },
  )
  if (response.status === 401) return undefined // not ready yet
  const cookies = response.headers.getSetCookie?.() ?? []
  for (const cookie of cookies) {
    const pair = cookie.split(';')[0].trim()
    if (pair.includes('=')) return pair
  }
  throw new Error(
    `the launch-token exchange returned HTTP ${response.status} without a session cookie`,
  )
}

/** POST the DS Bot envelope `{endpoint, payload}` and return its `value`, or throw. */
async function call(port, cookie, endpoint, payload = {}) {
  const response = await fetch(`http://127.0.0.1:${port}/api/bot`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ endpoint, payload }),
  })
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new Error(
        `${endpoint}: HTTP ${response.status} — the profile has an authentication gateway in front of ` +
          `/api/bot. Provisioning needs the default profile, which has none. If you enabled auth with ` +
          `dsh/scripts/enable-auth.sh, remove dsh-ui-auth before provisioning.`,
      )
    }
    throw new Error(`${endpoint}: HTTP ${response.status}`)
  }
  const body = await response.json()
  if (body?.ok !== true) {
    const error = new Error(`${endpoint}: ${body?.error?.message ?? 'unknown error'}`)
    error.code = body?.error?.code
    throw error
  }
  return body.value
}

async function waitForReady(port, child, launcher, timeoutMs = 180_000) {
  const deadline = Date.now() + timeoutMs
  let lastError
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`the DSH server exited early with code ${child.exitCode}`)
    }
    if (launcher.launchToken === undefined) {
      await sleep(500)
      continue
    }
    try {
      const cookie = await exchangeToken(port, launcher.launchToken)
      if (cookie !== undefined) {
        await call(port, cookie, 'state')
        return cookie
      }
      lastError = new Error('the server is not accepting the launch token yet')
    } catch (error) {
      lastError = error
    }
    await sleep(1000)
  }
  throw new Error(`the DSH server did not become ready: ${lastError?.message ?? 'timeout'}`)
}

/** Read existing agents from the on-disk roster, if any. */
async function readExistingBots() {
  if (!existsSync(STATE_PATH)) return {}
  try {
    const parsed = JSON.parse(await readFile(STATE_PATH, 'utf8'))
    return parsed?.bots ?? {}
  } catch {
    return {}
  }
}

function startServer(port) {
  const args = ['--profile', 'web', '--host', '127.0.0.1', '--port', String(port), '--no-open']
  log(`starting DSH on 127.0.0.1:${port}`)
  const env = {
    ...process.env,
    DSH_HOME,
    DSH_AGENTS_HOME: join(DSH_HOME, 'agents'),
    SMALLPE_TEAM_WORKSPACE: TEAM_WORKSPACE,
    PATH: `${join(DSH_DIR, 'node_modules', '.bin')}:${process.env.PATH ?? ''}`,
    CHROME_DEVTOOLS_MCP_NO_UPDATE_CHECKS: '1',
  }
  // Never let the child attach to the harness session that launched us.
  for (const key of ['DSH_PROFILE', 'DSH_PROFILE_DIR', 'DSH_SESSION_ID', 'DSH_WEB_URL', 'DSH_SHELL']) {
    delete env[key]
  }
  // Launch from the team workspace, exactly as bin/run.sh does. DSH records the
  // invoking directory as the workspace root, so provisioning from here makes the
  // SmallPE team folder the workspace that every agent and session is created in.
  // (main() has already created that folder.)
  return spawn(DSH_BIN, args, { cwd: TEAM_WORKSPACE, env, stdio: ['ignore', 'pipe', 'pipe'] })
}

async function stopServer(child) {
  if (child.exitCode !== null) return
  child.kill('SIGTERM')
  const deadline = Date.now() + 10_000
  while (child.exitCode === null && Date.now() < deadline) await sleep(200)
  if (child.exitCode === null) child.kill('SIGKILL')
}

async function main() {
  if (!existsSync(DSH_BIN)) {
    throw new Error(`the local DSH runtime is missing: ${DSH_BIN}\nRun ./bin/install.sh first.`)
  }
  if (!existsSync(SEED_PATH)) throw new Error(`missing roster seed: ${SEED_PATH}`)

  const seed = JSON.parse(await readFile(SEED_PATH, 'utf8'))
  const entries = Array.isArray(seed?.bots) ? seed.bots : []
  if (entries.length === 0) throw new Error(`the roster seed lists no agents: ${SEED_PATH}`)

  // The shared team workspace must exist before DS Bot accepts it as a working directory,
  // and each agent needs its output subfolder inside it (git cannot carry empty folders).
  const workspaceOf = (entry) => {
    const relative = entry.workspace ?? seed?.workspace ?? '.'
    const dir = isAbsolute(relative) ? relative : resolve(ROOT, relative)
    if (dir !== ROOT && !dir.startsWith(ROOT + '/')) {
      throw new Error(`refusing to use a workspace outside the repository: ${dir}`)
    }
    return dir
  }
  await mkdir(TEAM_WORKSPACE, { recursive: true })
  for (const entry of entries) {
    const workspace = workspaceOf(entry)
    await mkdir(workspace, { recursive: true })
    if (entry.outputs) await mkdir(join(workspace, entry.outputs), { recursive: true })
  }

  const existing = await readExistingBots()
  const existingByName = new Map(Object.values(existing).map((bot) => [bot.name, bot]))
  const seedNames = new Set(entries.map((entry) => entry.name))
  const missing = entries.filter((entry) => !existingByName.has(entry.name))
  // A placeholder DS Bot created for an empty team, which we do not want in the sidebar.
  const strays = Object.values(existing).filter(
    (bot) => !seedNames.has(bot.name) && BOOTSTRAP_PLACEHOLDER_NAMES.has(bot.name),
  )

  if (missing.length === 0 && strays.length === 0 && !FORCE) {
    log(`all ${entries.length} SmallPE agents are already provisioned; nothing to do.`)
    return
  }

  const port = REQUESTED_PORT ?? (await freePort())
  const child = startServer(port)
  const launcher = new Launcher()
  launcher.attach(child)

  try {
    const cookie = await waitForReady(port, child, launcher)
    log('DSH is up and authenticated; creating the SmallPE team')

    let view = await call(port, cookie, 'state')
    const byName = new Map(view.bots.map((bot) => [bot.name, bot]))

    for (const entry of entries) {
      const dir = workspaceOf(entry)
      const existingBot = byName.get(entry.name)

      if (existingBot !== undefined) {
        if (!FORCE) {
          log(`  = ${entry.name} (already present)`)
          continue
        }
        await call(port, cookie, 'update-bot', {
          id: existingBot.id,
          role: entry.role,
          instructions: entry.instructions,
          ...(entry.color ? { color: entry.color } : {}),
          // The avatar is part of the shipped look, so --force re-applies it too.
          ...(entry.avatar ? { avatar: entry.avatar } : {}),
          workDir: dir,
        })
        log(`  ~ ${entry.name} (updated)`)
        continue
      }

      const bot = await call(port, cookie, 'create-bot', {
        name: entry.name,
        role: entry.role ?? '',
        instructions: entry.instructions ?? '',
        ...(entry.color ? { color: entry.color } : {}),
        ...(entry.avatar ? { avatar: entry.avatar } : {}),
        // No `model`: the agent inherits whatever model the user configures in DSH,
        // so it is theirs rather than being pinned to the author's provider.
        workDir: dir,
      })
      byName.set(entry.name, bot)
      log(`  + ${entry.name}  (${entry.role ?? ''})  --> ${dir}`)
    }

    // Promote the seeded main agent.
    const mainEntry = entries.find((entry) => entry.main === true) ?? entries[0]
    const mainBot = byName.get(mainEntry.name)
    if (mainBot === undefined) throw new Error(`the main agent ${mainEntry.name} was not created`)
    await call(port, cookie, 'set-main', { id: mainBot.id, main: true, primary: true })
    log(`  * ${mainEntry.name} is the Main Bot`)

    // Remove the placeholder DS Bot creates for an empty team, so the sidebar shows
    // exactly the SmallPE team. Never touch agents the user made themselves.
    view = await call(port, cookie, 'state')
    for (const bot of view.bots) {
      if (seedNames.has(bot.name)) continue
      if (!BOOTSTRAP_PLACEHOLDER_NAMES.has(bot.name)) continue
      try {
        if (bot.id !== mainBot.id) await call(port, cookie, 'set-main', { id: bot.id, main: false })
        await call(port, cookie, 'delete-bot', { id: bot.id })
        log(`  - removed placeholder "${bot.name}"`)
      } catch (error) {
        log(`  ! could not remove placeholder "${bot.name}": ${error.message}`)
      }
    }

    log(`provisioned ${entries.length} SmallPE agents into ${DSH_HOME}/bot`)
  } catch (error) {
    const tail = launcher.tail()
    if (tail) console.error(tail)
    throw error
  } finally {
    await stopServer(child)
  }
}

main().catch((error) => {
  console.error(`[smallpe] ERROR: ${error.message}`)
  process.exitCode = 1
})
