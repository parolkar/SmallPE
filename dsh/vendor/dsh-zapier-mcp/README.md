<img src="icon.svg" width="72" height="72" alt="dsh-zapier-mcp icon">

# dsh-zapier-mcp

**Connect your hosted [Zapier MCP](https://mcp.zapier.com/) server to DeepSeek Harness — paste one token in Settings, and Zapier's tools become agent tools in every session.**

**MIT** · **DSH 0.2.x** · **Node ≥ 22.19** · **No build step**

## Why

Zapier's hosted MCP server exposes your connected apps behind a single endpoint. Wiring that endpoint into a harness usually means editing config files and restarting, and it usually means leaving a secret lying in YAML.

This bundle does neither. It adds one row to a DSH profile, adds a **Zapier MCP** page to the harness Web UI, and stores the token where secrets belong: the profile credential store. On save it re-connects immediately and tells you what happened. While connected, it also briefs the model on how Zapier's meta-tool surface works, so the model reaches for an app you have not enabled yet instead of claiming it is unavailable.

## Features

- **Hosted Zapier MCP** — connects to `https://mcp.zapier.com/api/v1/connect` with your token. No local MCP server, no bridge process.
- **Token in Settings, directly below Models** — a dedicated **Zapier MCP** page for pasting, re-checking, and removing the token.
- **Instant verification and tool refresh** — saving re-connects immediately; the page reports `Connected — N tools available` with the refreshed tool name list, or `Token rejected` with the server's message.
- **Zapier intelligence in the system prompt** — while connected, the plugin tells the model that the listed tools are scaffolding, maps Zapier's meta-tool names to their callable `mcp__<serverName>__*` names, and lists which apps are enabled right now. See [System-prompt intelligence](#system-prompt-intelligence).
- **Every session, including DS Bot** — the row mounts at the harness root, so the tools are not session-scoped.
- **Advanced endpoint override** — point the plugin at another MCP endpoint (self-hosted or a local test server) from **Settings → Zapier MCP → Advanced**.
- **No build step** — plain ESM, no transpiler, no bundler; `npm test` needs no install.
- **No token in config files** — the token lives in the harness credential store under `credentialRef`; configuration carries only the reference name.

## Requirements

| Requirement | Version |
| --- | --- |
| DeepSeek Harness (DSH) | `0.2.x` — built and tested against `0.2.1-rc.2` |
| Node.js | `>= 22.19` |
| Zapier account with a hosted MCP server | [mcp.zapier.com](https://mcp.zapier.com/) |

The bundle depends on the shipped package `@deepseek-ai/dsh-mcp-client` at exactly `0.2.1-rc.2`, which performs the MCP connection and tool registration. When your harness version changes, that pin must be raised in lockstep — see [Compatibility](#compatibility).

## Installation

Install the bundle into a DSH profile with `dsh plugin`. The command forwards its remaining arguments verbatim to pnpm in the profile directory, so `add`, `remove`, and `why` are the pnpm verbs:

```text
Usage: dsh plugin [options] [args...]

manage a profile's plugins by forwarding the remaining arguments to pnpm in the
profile directory

Arguments:
  args              pnpm arguments, forwarded verbatim (add <pkg>, remove <pkg>,
                    why <pkg>, ...)

Options:
  --profile <name>  the profile whose plugins to manage (initialized on first
                    use)
  -h, --help        show this help
```

### Recommended: install from GitHub

The normal path is a GitHub spec, because the package's dependencies come with it:

```sh
dsh plugin --profile web add https://github.com/parolkar/dsh-zapier-mcp
```

### Local checkout (development)

A local path is a **local directory link**, not a packed copy: pnpm records the
checkout in place and does **not** install that checkout's own dependencies for
it. The bundle imports `@deepseek-ai/dsh-mcp-client` and
`@deepseek-ai/schemastery`, so a plain local link will not work until those
resolve. Either install the checkout's dependencies first:

```sh
cd /absolute/path/to/dsh-zapier-mcp
pnpm install
dsh plugin --profile web add /absolute/path/to/dsh-zapier-mcp
```

or install with a `file:` spec, which brings the checkout's dependencies along:

```sh
dsh plugin --profile web add file:/absolute/path/to/dsh-zapier-mcp
```

### Enable the bundle, then reload

1. Install the package as above.
2. **Enable the installed bundle** in the harness **Plugins UI**. Enabling it
   applies the bundle's [`cordis.patch.yml`](cordis.patch.yml), which inserts the
   one `zapier-mcp` row — that row is what mounts both halves of the plugin.
3. **Reload the browser tab.** A page that was already open does not pick up the
   newly registered Settings page; refresh so **Settings → Zapier MCP** appears.

> Replace `web` with whichever profile you run (`dsh plugin --profile <name> ...`).
> `dsh plugin --help` shows the same summary; `dsh --help` lists the launcher
> flags and confirms the plugin command form.

## Getting your Zapier MCP token

1. Go to [mcp.zapier.com](https://mcp.zapier.com/) and create a server, or open
   an existing one.
2. Select the tools (Zapier actions) you want the model to have quick access to.
   You can enable more later — a tool that is not listed yet is never a missing
   capability (see [How Zapier MCP actually works](#how-zapier-mcp-actually-works)).
3. Copy the server's **connect URL** or token. The URL has this shape:

   ```text
   https://mcp.zapier.com/api/v1/connect?token=<USER_ZAPIER_MCP_TOKEN>
   ```

4. In the harness, open **Settings → Zapier MCP** and paste **only the token**
   — the `token` query parameter value, not the whole URL — into the token
   field, then choose **Save & verify**.

## Using it

### The Settings page

**Settings → Zapier MCP** sits directly below **Models**. It lets you:

- **Paste the token** and **Save & verify**. Saving stores it in the profile
  credential store and immediately re-connects.
- **See the verification result.** On success the page shows
  `Connected — N tools available` plus the refreshed list of tool names (the
  first 25; if there are more, the page says how many are shown). On failure it
  shows `Token rejected` together with the server's message — for example, an
  invalid token returns `Invalid OAuth token - please re-authenticate`. The page
  also shows when it was last checked.
- **Re-check.** Forces a fresh connection attempt and refreshes the tool list
  without changing the token.
- **Remove token.** Asks for a second click to confirm, then deletes the stored
  credential; the server disconnects.
- **Advanced → MCP endpoint override.** An optional URL for a non-default MCP
  endpoint. Leave it empty to use `https://mcp.zapier.com/api/v1/connect`; the
  page shows which endpoint is in use. This is the field to use for a
  self-hosted endpoint or the [local test server](#development--tests).

The page only ever learns *whether* a token is configured. It never receives
the token value back.

### The tools

Once connected, the tools bridged from Zapier appear to the model as ordinary
agent tools named:

```text
mcp__zapier__<tool>
```

The `zapier` part is the tool-name namespace and is configurable via
`serverName`. Because the row mounts at the harness root, these tools are
available in **every session and agent, including DS Bot**.

If you change which actions are enabled in Zapier, use **Re-check** on the
Settings page to refresh the list; the harness does not poll Zapier on its own.

## How Zapier MCP actually works

This is the part that surprises people, and the reason this plugin injects a
system-prompt section at all.

### The tool list is scaffolding, not the capability limit

Zapier's hosted MCP server returns a **fixed set of about 16 meta-tools** from
`tools/list`, no matter which apps you have connected. They are the plumbing:
discover / enable / disable / inspect, execute read / execute write, list and
manage connections, `auto_provision`, `write_code_action`, skills, feedback and
the configuration URL. It is the same list whether you connected one app or
eighty.

The real surface — 9,000+ apps — is **virtual**, and is resolved at call time.
**A missing tool never means an app is unavailable.** If there is no
`mcp__zapier__<some_app>` tool listed, that is expected: the model is meant to
discover and enable the action through the meta-tools.

### Apps, connections, actions

Three layers, from broadest to narrowest:

1. **App** — the integration (Gmail, Trello, …), identified internally by a
   `selected_api` value.
2. **Connection** — one authenticated account for that app. An app can have
   several connections; exactly one is the default.
3. **Action** — a specific operation on an app, enabled per server.

### The recommended call order

All names below are shown bare; call them as `mcp__zapier__<name>` (or
`mcp__<serverName>__<name>` if you changed `serverName`):

1. `mcp__zapier__inspect_zapier_actions` — see what is currently enabled.
2. If the action you need is missing:
   - `mcp__zapier__discover_zapier_actions` to find it, then
   - `mcp__zapier__enable_zapier_action` to turn it on. Enabling may return an
     **auth URL the user must open** to connect the app.
3. `mcp__zapier__inspect_zapier_actions` again, this time with `selected_api`
   and `tool_name`, to get the exact parameters for the action. Dynamic options
   arrive through `enum_property` / `params`.
4. `mcp__zapier__execute_zapier_read_action` for reads, or
   `mcp__zapier__execute_zapier_write_action` for writes.

A `connection_id` is only needed to override the default account for an app.
**Skills** cache a resolved multi-step procedure so the same sequence does not
have to be rediscovered.

### System-prompt intelligence

While the connection is live, the plugin registers **one bounded
system-prompt section** (`zapier-mcp`, placed just behind the MCP server
instructions). It contains four things:

1. A mapping from Zapier's bare meta-tool names to their callable
   `mcp__<serverName>__*` names.
2. A warning that the tool list is scaffolding, not the capability limit.
3. The currently enabled apps with their action and connection counts — for
   example `Enabled now: Gmail — 1 action, 2 accounts`. **App names and counts
   only: never account ids, account titles or emails.**
4. A rule to confirm with the user before writes, because
   `execute_zapier_write_action` acts on real external systems.

The section is rebuilt on every re-check and is **absent while disconnected**
(no token, rejected token, or connection down adds no context at all). Set
`systemPrompt: false` to disable it entirely. Separately, `dsh-mcp-client`
injects **Zapier's own server instructions** verbatim; `maxInstructionBytes`
bounds that block (see [Configuration](#configuration)).

## Configuration

All fields are optional and live in the row config:

| Field | Default | Meaning |
| --- | --- | --- |
| `serverName` | `zapier` | Tool-name namespace. Tools are registered as `mcp__<serverName>__<tool>`. |
| `endpoint` | `https://mcp.zapier.com/api/v1/connect` | Hosted Zapier MCP endpoint the token is appended to. |
| `credentialRef` | `ZAPIER_MCP_TOKEN` | Key in the profile credential store that holds the token. |
| `toolCallTimeoutMs` | `60000` | Timeout, in milliseconds, for a single tool call (also used for the inventory probe). |
| `maxInstructionBytes` | `131072` | Cap on the server-instructions block `dsh-mcp-client` accepts on the first connect attempt. |
| `instructionRetryBytes` | `1048576` | Larger cap used for one automatic retry when the first attempt failed only because the instructions exceeded `maxInstructionBytes`. |
| `systemPrompt` | `true` | Whether the plugin contributes its Zapier system-prompt section. Set `false` to opt out. |
| `endpointOverride` | `""` (empty) | Advanced. Alternate/self-hosted MCP endpoint. Empty means "use `endpoint`". |

The row also carries runtime **volatile** fields, written by the Host half and
read by the Settings page: `status`, `toolCount`, `toolNames`, `lastError`,
`checkedAt`, `inventory`, and `checkNonce`. `checkNonce` and `endpointOverride`
are the user-facing triggers — bumping them (which is what the page's Re-check
and Advanced buttons do) schedules a fresh check. You do not set any of these by
hand.

To override a field, target the existing `zapier-mcp` row from your profile
patch. A patch entry with an `id` and no `insert` replaces that row's fields, and
`config` is replaced **wholesale, not deep-merged** — so list every field you
want to keep. Fields you omit fall back to the defaults above. Leave the
volatile fields out: the harness settings service owns them and writes them
back.

```yaml
# profile patch (e.g. your profile's cordis.patch.yml)
- id: zapier-mcp
  name: 'dsh-zapier-mcp'          # asserts the existing plugin name
  config:
    serverName: zapier
    endpoint: https://mcp.zapier.com/api/v1/connect
    credentialRef: ZAPIER_MCP_TOKEN
    toolCallTimeoutMs: 120000
    maxInstructionBytes: 131072
    instructionRetryBytes: 1048576
    systemPrompt: true
    # endpointOverride: ''         # Advanced; set it from the Settings page instead
```

For everyday changes prefer the Settings page over hand-editing the patch:
token, re-check and endpoint override all have controls there, and they write
through the harness settings service.

### Compatibility

The harness decides how to compose patches; the `@deepseek-ai/dsh-mcp-client`
package does the MCP work, and this bundle pins it at exactly `0.2.1-rc.2` to
match DSH `0.2.1-rc.2`. If your DSH version differs, the symptom is usually that
the row fails to mount or the tools never register. The fix is to raise the pin
to the `@deepseek-ai/dsh-mcp-client` version shipped with your DSH release.

## How it works

The bundle is one row with two halves:

- **Host half** — [`index.js`](index.js), with testable logic in
  [`lib/host-logic.js`](lib/host-logic.js) and prompt text in
  [`lib/prompt.js`](lib/prompt.js). It resolves the token from the credential
  service **per connection attempt** (never caching a rotated or removed token),
  reads the effective endpoint per attempt (so an override applies without a
  reload), mounts `@deepseek-ai/dsh-mcp-client`, and re-connects when the
  credential changes or the page asks for a re-check. Results are published into
  the volatile config fields above; the system-prompt section is a pure read of
  the same facts.
- **Browser half** — [`client.js`](client.js). It registers the
  `settings.section` page named **Zapier MCP**, positioned directly below
  **Models**, and talks to the settings service to save, re-check and remove the
  token and to set the endpoint override.

Both halves are mounted by the single row inserted by
[`cordis.patch.yml`](cordis.patch.yml). See the repository files for the
implementation details.

## Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Settings page says `Token rejected` with `Invalid OAuth token - please re-authenticate` | Token is invalid, expired, or from a deleted Zapier server | Copy a fresh token from [mcp.zapier.com](https://mcp.zapier.com/) and save it again. |
| Connection returns HTTP 401 | Same as above — the endpoint rejects the credential | Re-issue the token in Zapier; re-check. |
| **Valid** token rejected with a message like `server instructions exceed maxInstructionBytes` | Zapier's own instruction block is larger than the cap. The plugin already retries once with `instructionRetryBytes` (`1048576`), so a remaining failure means the block is even larger than that. | Raise `maxInstructionBytes` / `instructionRetryBytes`. **Tradeoff:** those instructions are injected into every prompt, so a very large cap costs context on every request. |
| The page says Re-check forever and never settles | Endpoint unreachable from the harness, or the request hangs | Check network/proxy access to `mcp.zapier.com`, then Re-check. |
| Tool list looks stale after changing enabled actions in Zapier | The list is fetched at connect time; the harness does not poll | Use **Re-check** on the Settings page to refresh the list and the prompt inventory. |
| A tool you expected is not in the list | Zapier's `tools/list` is a fixed meta-tool set; actions are virtual | Not a bug — the model discovers and enables actions through the meta-tools. See [How Zapier MCP actually works](#how-zapier-mcp-actually-works). |
| You want to point at a different MCP endpoint (self-hosted, testing) | — | **Settings → Zapier MCP → Advanced → MCP endpoint override**, then save the endpoint. |
| Offline or flaky network | No route to `mcp.zapier.com` | Restore connectivity and Re-check; tool calls will fail until then. |
| Row fails to mount or no tools ever register after a DSH upgrade | `@deepseek-ai/dsh-mcp-client` pin no longer matches your DSH version | Raise the pin to the version shipped with your DSH release and restart. |
| You want the bundle gone | — | **Remove token** on the Settings page, then remove the bundle from the profile (`dsh plugin --profile <name> remove dsh-zapier-mcp`) and disable it in the Plugins UI. |

## Security & privacy

- **The token is never written to this bundle or to the profile config file.**
  It is stored by the harness credential service in `~/.dsh/.credentials.yaml`
  (file mode `600`) under `credentialRef` (default `ZAPIER_MCP_TOKEN`).
- The Settings page only ever learns **whether** the token is configured; it
  never receives the token value. The token input is a password field.
- The row config and the profile's Cordis patch contain only the credential
  *reference name* plus the volatile runtime fields (`status`, `toolCount`,
  `toolNames`, `lastError`, `checkedAt`, `inventory`, `checkNonce`), which the
  harness settings service writes back.
- The system-prompt section carries **app names and counts only** — never
  account ids, account titles or emails.
- The token is sent only to the effective MCP endpoint: the configured
  `endpoint`, or `endpointOverride` when you set one. If you point the override
  at a server you do not control, your token goes there.
- Removing the token deletes the stored credential; nothing else about your
  Zapier account is read or cached by this bundle.

## Development & tests

```sh
npm test
```

That is exactly:

```sh
node --check index.js && node --check client.js && node --check lib/host-logic.js && node --check lib/prompt.js && node test/host.test.mjs && node test/prompt.test.mjs && node test/client.test.mjs
```

There is no install required for the test script, and the package has no build
step. `index.js`, `client.js` and `lib/` are plain ESM.

### Local end-to-end checks

[`test/fake-mcp-server.mjs`](test/fake-mcp-server.mjs) is a stand-in for the
Zapier endpoint that speaks just enough MCP Streamable HTTP — `initialize`,
`tools/list` and `tools/call` — so the success path can be exercised offline:

```sh
node test/fake-mcp-server.mjs [--port 8765] [--reject]
```

- Default port is `8765`.
- `--reject` answers every request the way Zapier answers an invalid token
  (HTTP 401, `Invalid OAuth token - please re-authenticate`), exercising the
  failure path.

It is a test helper and is excluded from the published file list in
`package.json`. To use it against a live harness, start it and set
**Settings → Zapier MCP → Advanced → MCP endpoint override** to
`http://127.0.0.1:8765`, then save the endpoint.

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, code style, and
the pull request checklist.

## License

[MIT](LICENSE) © 2026 parolkar.

Not affiliated with, endorsed by, or sponsored by Zapier. "Zapier" is a
trademark of its owner and is used here only to describe what this plugin
connects to.

## Changelog

See [CHANGELOG.md](CHANGELOG.md).
