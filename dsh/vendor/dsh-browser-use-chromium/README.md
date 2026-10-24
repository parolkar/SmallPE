# dsh-browser-use-chromium

A DSH profile bundle that enables browser use for the DeepSeek Harness:

- `@deepseek-ai/dsh-browser-use` — the provider slot. Exactly one browser-use
  provider may be registered at a time.
- `@deepseek-ai/dsh-experimental-browser-use-chrome-devtools-mcp` — a
  per-Session Chromium browser driven by Chrome DevTools MCP.

Both packages are pinned to the runtime version (`0.2.1-rc.2`). npm's `latest`
tag for these packages still points at the older `0.1.6-alpha.1`; the build
matching this Harness is published under the `next` tag.

## Persistence

Browser state survives turns while the live Session remains attached. A Session
reload/resume starts fresh browser runtime state: stored conversation history
does not restore cookies or pages.

- `mode: launch` (this bundle's default) starts a fresh browser per Session.
- `mode: attach` connects one Session to an already-running browser that keeps
  its current tabs and login state. Set `endpoint` to an HTTP(S) debugging URL
  or a WS(S) browser endpoint. Cleanup disconnects and leaves the external
  browser running.
- `headless: false` shows the window (launch mode only).
- `executablePath` selects an existing Chromium instead of upstream discovery.

To switch modes, edit `cordis.patch.yml` and reinstall the bundle (or edit the
same row in the profile's `cordis.patch.yml`).

The provider must be mounted before a Session is created or resumed. Loading or
reloading the provider does not adopt Sessions that are already active.
