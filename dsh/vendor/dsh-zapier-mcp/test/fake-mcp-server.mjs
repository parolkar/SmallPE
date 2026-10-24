/**
 * A tiny stand-in for a hosted Zapier MCP server, for local end-to-end checks.
 *
 * It speaks just enough of the MCP Streamable HTTP transport for a real MCP
 * client to connect, list tools and call one:
 *
 *   POST /  initialize                  -> server info + `mcp-session-id`
 *   POST /  notifications/initialized   -> 202, empty
 *   POST /  tools/list                  -> the configured tools
 *   POST /  tools/call                  -> an echo result
 *   GET  /                              -> 405 (no server-initiated stream)
 *
 * The token in the `token` query parameter is not validated, so the point of
 * this server is to exercise the *success* path of the plugin. Pass
 * `--reject` (or `rejectAnyToken: true`) to answer every request the way
 * Zapier answers an invalid token, which exercises the failure path instead.
 *
 * Run standalone:
 *   node test/fake-mcp-server.mjs --port 8765
 *
 * @module dsh-zapier-mcp/test/fake-mcp-server
 */

import { createServer } from 'node:http';

/**
 * The ~16 fixed meta-tools a real Zapier MCP server advertises, whatever apps
 * are connected. The per-app capability surface is virtual and only reachable
 * through them, so a fake server must speak this shape to be representative.
 */
export const ZAPIER_META_TOOL_NAMES = [
  'discover_zapier_actions',
  'enable_zapier_action',
  'disable_zapier_action',
  'inspect_zapier_actions',
  'execute_zapier_read_action',
  'execute_zapier_write_action',
  'list_zapier_connections',
  'manage_zapier_connections',
  'auto_provision_mcp',
  'write_code_action',
  'list_zapier_skills',
  'get_zapier_skill',
  'create_zapier_skill',
  'update_zapier_skill',
  'delete_zapier_skill',
  'send_feedback',
  'get_configuration_url',
];

/** Tools this fake server advertises, shaped like real MCP tool definitions. */
export const DEFAULT_TOOLS = ZAPIER_META_TOOL_NAMES.map((name) => ({
  name,
  description: `Fake Zapier meta-tool \`${name}\`.`,
  inputSchema: { type: 'object', properties: {} },
}));

/** What the fake `inspect_zapier_actions` reports: apps, actions and accounts. */
export const DEFAULT_INVENTORY = {
  apps: [
    {
      app: 'Gmail',
      selected_api: 'GoogleMailV2CLIAPI',
      action_count: 1,
      connections: { total: 2, default: { id: 'conn-1', title: 'tester@example.com' } },
    },
    {
      app: 'Trello',
      selected_api: 'TrelloCLIAPI',
      action_count: 3,
      connections: { total: 1, default: { id: 'conn-2', title: 'team board' } },
    },
  ],
};


/** The exact body Zapier returns for an unusable token, minus HTTP framing. */
export const INVALID_TOKEN_BODY = JSON.stringify({
  jsonrpc: '2.0',
  id: null,
  error: {
    code: -31997,
    message: 'Invalid OAuth token - please re-authenticate',
    data: { authError: { status: 401, reason: 'Invalid OAuth token - please re-authenticate' } },
  },
});

/** Read one JSON body from an incoming request. */
function readJson(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    request.on('data', (chunk) => chunks.push(chunk));
    request.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8');
      if (text.length === 0) return resolve(undefined);
      try {
        resolve(JSON.parse(text));
      } catch (error) {
        reject(error);
      }
    });
    request.on('error', reject);
  });
}

/** Answer one JSON-RPC message, or `undefined` for a notification. */
function respond(message, tools, inventory) {
  if (message.method === 'initialize') {
    return {
      protocolVersion: typeof message.params?.protocolVersion === 'string' ? message.params.protocolVersion : '2025-06-18',
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: 'fake-zapier-mcp', version: '1.0.0' },
      instructions: 'Fake Zapier MCP server used by dsh-zapier-mcp tests.',
    };
  }
  if (message.method === 'tools/list') return { tools };
  if (message.method === 'tools/call') {
    const name = message.params?.name;
    const args = message.params?.arguments ?? {};
    // The one meta-tool whose payload the plugin digests for the prompt.
    if (name === 'inspect_zapier_actions') {
      return {
        content: [{ type: 'text', text: JSON.stringify(inventory) }],
        structuredContent: inventory,
        isError: false,
      };
    }
    return {
      content: [{ type: 'text', text: `${name}(${JSON.stringify(args)}) via fake-zapier-mcp` }],
      isError: false,
    };
  }
  if (message.method === 'ping') return {};
  return undefined;
}

/**
 * Start the fake server.
 *
 * @param options - `port` (0 picks a free port), `tools` (defaults to
 *   {@link DEFAULT_TOOLS}), `rejectAnyToken` (answer 401 like an invalid
 *   Zapier token), `logger` (receives one line per request).
 * @returns the listening port, the base URL, and a `close()` promise.
 */
export async function startFakeZapierMcpServer(options = {}) {
  const tools = options.tools ?? DEFAULT_TOOLS;
  const inventory = options.inventory ?? DEFAULT_INVENTORY;
  const log = options.logger ?? (() => {});
  const sessions = new Set();

  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    log(`${request.method} ${url.pathname}${url.search.length > 0 ? '?…' : ''}`);

    if (options.rejectAnyToken === true) {
      response.writeHead(401, { 'content-type': 'application/json; charset=utf-8' });
      response.end(INVALID_TOKEN_BODY);
      return;
    }

    if (request.method === 'GET') {
      // No server-initiated stream: the transport permits a plain 405 here.
      response.writeHead(405, { allow: 'POST, DELETE' });
      response.end();
      return;
    }

    if (request.method === 'DELETE') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end('{}');
      return;
    }

    if (request.method !== 'POST') {
      response.writeHead(405, { allow: 'POST, DELETE' });
      response.end();
      return;
    }

    let message;
    try {
      message = await readJson(request);
    } catch {
      response.writeHead(400, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }));
      return;
    }

    if (message === undefined) {
      response.writeHead(202);
      response.end();
      return;
    }

    const messages = Array.isArray(message) ? message : [message];
    const replies = [];
    for (const one of messages) {
      const result = respond(one, tools, inventory);
      if (result !== undefined) replies.push({ jsonrpc: '2.0', id: one.id ?? null, result });
    }

    if (replies.length === 0) {
      // Notifications (for example `notifications/initialized`) want an empty 202.
      response.writeHead(202);
      response.end();
      return;
    }

    const headers = { 'content-type': 'application/json; charset=utf-8' };
    const sessionId = request.headers['mcp-session-id'];
    if (typeof sessionId === 'string') sessions.add(sessionId);
    if (sessions.size === 0 && messages.some((one) => one.method === 'initialize')) {
      sessions.add('fake-session-1');
      headers['mcp-session-id'] = 'fake-session-1';
    }
    response.writeHead(200, headers);
    response.end(JSON.stringify(replies.length === 1 ? replies[0] : replies));
  });

  const port = await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.port ?? 0, '127.0.0.1', () => resolve(server.address().port));
  });

  return {
    port,
    baseUrl: `http://127.0.0.1:${port}/api/v1/connect`,
    async close() {
      await new Promise((resolve) => server.close(resolve));
    },
  };
}

/** Standalone entry point: `node test/fake-mcp-server.mjs [--port N] [--reject]`. */
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop() ?? '')) {
  const portFlag = process.argv.indexOf('--port');
  const port = portFlag >= 0 ? Number(process.argv[portFlag + 1]) : 8765;
  const server = await startFakeZapierMcpServer({
    port,
    rejectAnyToken: process.argv.includes('--reject'),
    logger: (line) => console.log(`[fake-zapier] ${line}`),
  });
  console.log(`[fake-zapier] listening on ${server.baseUrl} (token ignored)`);
}
