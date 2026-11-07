# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.2] - 2026-10-24

### Fixed

- The settings page crashed on first render with
  `template.replace is not a function`. Five dictionary entries
  (`connected`, `toolsPartial`, `checkedAt`, `endpointHelp`, `endpointInUse`)
  were formatter functions, but the harness locale runtime resolves templates
  as plain strings with `{name}` placeholders substituted from a params
  object. All five are now placeholder strings in both English and Chinese,
  and their call sites pass params objects.
- Regression tests: every dictionary value must be a plain non-empty string
  (the previous test explicitly allowed functions, which is how this shipped),
  and `{placeholder}` names must match between English and Chinese.

## [0.1.1] - 2026-10-24

### Fixed

- A crash while rendering the Zapier MCP settings page no longer reads as a
  silently blank page. The slot host's own error boundary abdicates a crashed
  section — the entry leaves the content projection while its navigation label
  stays — so the page appeared empty with no way to see why. The page now
  registers its own crash shield first: a rendering error is caught one level
  down, the error message and the top stack lines are shown in the page itself
  with a **Retry** button, and the original stack still reaches the browser
  console. If the host React lacks class-component support the page degrades to
  the previous unwrapped behaviour rather than failing to load.

## [0.1.0] - 2026-10-24

### Added

- Initial public release of `dsh-zapier-mcp`, an MIT-licensed DeepSeek Harness
  bundle that connects a user's hosted Zapier MCP server to the harness.
- Host half (`index.js`): mounts `@deepseek-ai/dsh-mcp-client` at the harness
  root, reads the Zapier MCP token from the profile credential store per
  connection attempt (never caching a rotated or removed token), and registers
  the server's tools as `mcp__zapier__*` in every session, including DS Bot.
  `lib/host-logic.js` carries the dependency-free lifecycle logic.
- Browser half (`client.js`): registers a **Zapier MCP** page in Settings,
  directly below Models. It offers **Save & verify**, **Re-check**, and a
  two-step **Remove token**, and shows live verification: `Connected — N tools
  available` with the refreshed tool-name list, or `Token rejected` with the
  server's message, plus the last-checked time. An **Advanced** disclosure holds
  the **MCP endpoint override**. English and Chinese strings are included.
- Zapier meta-tool intelligence (`lib/prompt.js`): while connected, one bounded
  system-prompt section maps Zapier's bare meta-tool names to their callable
  `mcp__<serverName>__*` names, warns that the fixed `tools/list` is scaffolding
  rather than the capability limit, lists the enabled apps with their action and
  connection counts (app names and counts only — never account ids, titles or
  emails), and requires confirmation before writes. It is rebuilt on every
  re-check and is absent while disconnected. `systemPrompt: false` opts out.
- Large-server-instructions handling: `maxInstructionBytes` (default `131072`)
  caps the block `dsh-mcp-client` accepts, and a failure caused only by that cap
  triggers exactly one automatic retry with the larger `instructionRetryBytes`
  (default `1048576`) so a valid token is not reported as broken.
- Configuration fields `serverName`, `endpoint`, `credentialRef`,
  `toolCallTimeoutMs`, `maxInstructionBytes`, `instructionRetryBytes`,
  `systemPrompt`, and the volatile `endpointOverride`, plus volatile runtime
  fields (`status`, `toolCount`, `toolNames`, `lastError`, `checkedAt`,
  `inventory`, `checkNonce`) written into the profile's Cordis patch by the
  harness settings service. `checkNonce` and `endpointOverride` are the
  user-writable paths that trigger a fresh check.
- Connection inventory probe: read through Zapier's own
  `inspect_zapier_actions` meta-tool, digested to a bounded one-line summary,
  and degrading silently to no inventory on any failure.
- One-row bundle patch (`cordis.patch.yml`), a no-install test suite
  (`npm test`) covering host logic, prompt text and client helpers, and
  `test/fake-mcp-server.mjs` — a local MCP Streamable HTTP stand-in
  (`--port`, `--reject`) for offline success/failure-path checks.

### Notes

- Requires DeepSeek Harness `0.2.x` (built and tested against `0.2.1-rc.2`) and
  Node.js `>= 22.19`.
- Depends on the shipped package `@deepseek-ai/dsh-mcp-client` at exactly
  `0.2.1-rc.2`. When the harness version changes, that pin must be raised in
  lockstep (see the compatibility section of the [README](README.md)).
- The Zapier MCP token is never written to this bundle or to the profile config
  file; it is stored by the harness credential service and only its reference
  name appears in configuration. A `file:`/directory install and the Advanced
  endpoint override are documented in the [README](README.md).

[0.1.0]: https://github.com/parolkar/dsh-zapier-mcp/releases/tag/v0.1.0
