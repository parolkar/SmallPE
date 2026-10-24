# Contributing

Thanks for taking a look at `dsh-zapier-mcp`. This is a small, dependency-light
bundle and contributions are welcome — bug reports, locale strings, docs fixes,
and focused pull requests.

## Development setup

There is no build step, and no install is required to run the tests: the test
script shells out to `node --check` and three plain Node test files.

- Node.js `>= 22.19` is required.
- To work on the Host half (`index.js`, `lib/host-logic.js`, `lib/prompt.js`) or
  the browser half (`client.js`) against a live harness, install the bundle into
  a throwaway DSH profile.

  **From a local checkout**, `dsh plugin ... add <dir>` records a local directory
  link; it does not install the checkout's own dependencies for it. Install them
  first, or use a `file:` spec:

  ```sh
  cd /absolute/path/to/dsh-zapier-mcp
  pnpm install
  dsh plugin --profile <name> add /absolute/path/to/dsh-zapier-mcp
  # or: dsh plugin --profile <name> add file:/absolute/path/to/dsh-zapier-mcp
  ```

  **From GitHub**, the dependencies come with the package:

  ```sh
  dsh plugin --profile <name> add https://github.com/parolkar/dsh-zapier-mcp
  ```

  `dsh plugin` forwards its remaining arguments verbatim to pnpm in the profile
  directory. Run `dsh plugin --help` for the exact list. After installing, enable
  the bundle in the Plugins UI, and reload any browser tab that was already open
  so the Settings page appears.

  **Editing Host code needs a harness restart.** A bundle *config* change is
  reconciled live, but the running process keeps the Host module it already
  imported: replacing `index.js`/`lib/*` under an installed bundle re-applies
  the rows without re-reading the file. Restart the harness after changing Host
  code and confirm the new behavior before trusting a live result — otherwise
  you are testing the previous revision. The browser half is served by revision,
  so `client.js` changes do reach a reloaded tab.

## Tests

```sh
npm test
```

This runs, exactly as declared in `package.json`:

```sh
node --check index.js && node --check client.js && node --check lib/host-logic.js && node --check lib/prompt.js && node test/host.test.mjs && node test/prompt.test.mjs && node test/client.test.mjs
```

Please run `npm test` before opening a pull request, and keep it passing.

### Manual end-to-end checks

`test/fake-mcp-server.mjs` is a local stand-in for the Zapier endpoint that
speaks just enough MCP Streamable HTTP (`initialize`, `tools/list`,
`tools/call`):

```sh
node test/fake-mcp-server.mjs [--port 8765] [--reject]
```

Start it and point **Settings → Zapier MCP → Advanced → MCP endpoint override**
at `http://127.0.0.1:8765` to exercise the success path offline; `--reject`
answers like an invalid token for the failure path. It is a test helper and is
excluded from the published `files` list.

## Code style

- Plain ESM (`import` / `export`), no transpiler, no build step, no bundler.
- JSDoc on exported functions and non-obvious logic.
- Keep the surface small: prefer a few focused files over new abstractions.
- Keep logic that can be tested without `node_modules` in `lib/`, so the test
  suite runs on a bare checkout.
- **Keep the token out of `Config`.** The Zapier MCP token must only ever be
  read from, and written to, the harness credential store. Configuration rows
  and the profile's `cordis.patch.yml` may contain the credential *reference
  name* (`credentialRef`, default `ZAPIER_MCP_TOKEN`) and the volatile fields —
  never the token value itself.
- Never log the token, never echo it into a status field, and never send it to
  the Settings page.
- **The system-prompt section carries no identifiers.** It may name an app and
  its action/connection counts; it must never include account ids, account
  titles, emails, tokens, or other per-account data. Keep the section and the
  inventory digest bounded.
- User-writable volatile paths that should schedule a fresh check belong in
  `RECHECK_PATHS`; paths the plugin writes about itself belong in `STATUS_PATHS`
  so publishing status cannot trigger a re-check loop.

## Pull request checklist

- [ ] `npm test` passes.
- [ ] No token, secret, or credential value appears in any file, log line, or
      status field.
- [ ] New or changed configuration fields are documented in `README.md` with
      their defaults.
- [ ] Any change to the `@deepseek-ai/dsh-mcp-client` version pin states the DSH
      version it was tested against, and `package.json` `engines` /
      `dsh.compatibility` are updated consistently.
- [ ] New user-visible strings are added to the locale files and the client's
      fallback dictionary rather than hardcoded.
- [ ] Prompt or inventory changes still carry no account identifiers and respect
      their bounds.
- [ ] `CHANGELOG.md` has an entry under an appropriate heading.

## License and contributions

By contributing you agree that your contribution is licensed under the
[MIT License](LICENSE) that covers this project. There is no CLA and no
copyright assignment: keep your commits and open a pull request.

Unless you explicitly state otherwise, any contribution intentionally submitted
for inclusion in this project by you shall be licensed as above, without any
additional terms or conditions.
