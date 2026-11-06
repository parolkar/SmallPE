#!/usr/bin/env node
/**
 * Expose the loopback-only Web UI on the port a container platform routes to.
 *
 * Why this exists
 * ---------------
 * `dsh web --host` only accepts one concrete local interface address and rejects
 * wildcards (0.0.0.0, ::). Platforms such as Railway route public traffic to whatever
 * listens on $PORT on all interfaces. So the harness stays on 127.0.0.1, exactly as a
 * local install does, and this forwards raw TCP from $PORT to it.
 *
 * Raw TCP rather than an HTTP proxy: the Host, Origin and X-Forwarded-* headers the
 * platform's edge sets reach DSH unchanged (its --trusted-host fence and dsh-ui-auth
 * both read them), and WebSocket upgrades need no special handling.
 *
 * Usage:  PORT=8080 DSH_PORT=3080 node dsh/scripts/forward-port.mjs
 */

import net from 'node:net'

const listenPort = Number(process.env.PORT || 8080)
const targetPort = Number(process.env.DSH_PORT || 3080)
const targetHost = '127.0.0.1'

const server = net.createServer((client) => {
  const upstream = net.connect(targetPort, targetHost)
  client.pipe(upstream).pipe(client)
  // Either side failing or closing tears down both; until DSH is listening, a
  // connection is simply refused and the platform's health check retries.
  const close = () => {
    client.destroy()
    upstream.destroy()
  }
  for (const socket of [client, upstream]) {
    socket.on('error', close)
    socket.on('close', close)
  }
})

server.on('error', (error) => {
  console.error(`[smallpe] forward-port: ${error.message}`)
  process.exit(1)
})

// No host: Node listens on :: with dual-stack, or 0.0.0.0 where IPv6 is unavailable.
server.listen(listenPort, () => {
  console.log(`[smallpe] forwarding :${listenPort} -> ${targetHost}:${targetPort}`)
})

// Open WebSockets would keep server.close() waiting forever; just stop.
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => process.exit(0))
