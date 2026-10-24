# SmallPE × DeepSeek Harness — integration contract

Reference for anyone maintaining this integration. It records the exact layout and the
interfaces between `install.sh`, `run.sh`, the profile templates and the `dsh/vendor/`
plugins — the names and paths below are load-bearing, because the profile's dependency
specifiers and the branding route all resolve **relatively** and will break if the layout
moves.

If you change something here, re-run `./dsh/scripts/verify-install.sh` afterwards.

`$ROOT` below is the cloned `SmallPE/` folder. Nothing in this integration may hardcode an
absolute host path, a username, a hostname, or a port.

---

## 1. Goal

Clone `SmallPE` → run `./install.sh` → run `./run.sh` → a locally-installed DeepSeek Harness
opens in the browser with **SmallPE branding** and the **whole SmallPE agent team already
present as DS Bot agents** (Managing Partner + 8 specialists), all working inside this repo.

Only host prerequisite: **Node.js ≥ 22.19** (and `git`). No global pnpm, no `npx`, no Ruby.

## 2. Layout (fixed)

```
$ROOT/
├── install.sh                     # one-time setup
├── run.sh                         # launch the web UI
├── DSH-README.md                  # user documentation
├── .gitignore                     # extended for dsh/
├── agentic-team-for-private-equity/   # EXISTING — personas + workflows (do not restructure)
└── dsh/                           # the localised harness — remove this and the install is gone
    ├── package.json               # @deepseek-ai/dsh + pnpm, exact pins
    ├── package-lock.json          # committed, from npm install
    ├── CONTRACT.md                # this file
    ├── node_modules/              # gitignored, ~890 MB
    ├── .pnpm-store/               # gitignored, pnpm content-addressable store
    ├── home/                      # gitignored == $DSH_HOME
    │   ├── branding/              # logo-64.png, logo-128.png, logo-wide.png
    │   ├── profiles/web/          # profile: package.json, cordis*.yml, pnpm-workspace.yaml, node_modules/
    │   ├── bot/                   # DS Bot roster/memory/sessions
    │   └── sessions/, storages/, logs/, .credentials.yaml …
    ├── templates/                 # committed source of truth, copied into home/ by install.sh
    │   ├── branding/{logo-64,logo-128,logo-wide}.png
    │   ├── bots.seed.json         # the agent roster, one entry per DS Bot agent
    │   ├── bot-workspaces.json    # agent -> folder map
    │   ├── state.seed.json        # empty DS Bot state
    │   ├── credentials.template.yaml
    │   ├── secrets.template.json
    │   └── profiles/web/{package.json,cordis.yml,cordis.patch.yml,pnpm-workspace.yaml,pnpm-lock.yaml}
    ├── vendor/                    # committed local plugins
    │   ├── smallpe-brand/         # sidebar branding
    │   ├── dsbot-auth-bridge/     # opens POST /api/bot through the auth gateway (only active with dsh-ui-auth)
    │   └── dsh-browser-use-chromium/  # Chrome DevTools browser tools
    └── scripts/
        ├── provision-bots.mjs     # creates the roster through the DS Bot API
        ├── enable-auth.sh         # opt-in: adds dsh-ui-auth to the profile
        └── verify-install.sh      # acceptance checks
```

## 3. `$DSH_HOME` and relative-path rules (critical)

* `install.sh` and `run.sh` both export `DSH_HOME="$ROOT/dsh/home"`.
* The profile directory is therefore `$ROOT/dsh/home/profiles/web`.
* Relative `link:`/`file:` specifiers in `templates/profiles/web/package.json` resolve
  **against the profile directory**, so:
  * `vendor/smallpe-brand`        → `link:../../../vendor/smallpe-brand`
  * `vendor/dsbot-auth-bridge`    → `link:../../../vendor/dsbot-auth-bridge`
  * `vendor/dsh-browser-use-chromium` → `file:../../../vendor/dsh-browser-use-chromium`
* `templates/profiles/web/pnpm-workspace.yaml` must contain `storeDir: ../../../.pnpm-store`
  so the pnpm content-addressable store stays inside the repo. (Verified: this is the only
  knob pnpm 12.11.2 honours; env vars and `.npmrc` are ignored.)
* **Never** write an absolute `/Users/...`, `/home/...`, `~/...` path into any committed file.
* `run.sh` prepends `$ROOT/dsh/node_modules/.bin` to `PATH` — the CLI `dsh plugin` always
  resolves `pnpm` from `PATH`, so a folder-local pnpm must win over any global one.

## 4. Branding contract

`dsh-custom-logo` serves `/custom-logo/*.png` from `$DSH_HOME/branding` with **fixed filenames**
and **no config option**. So:

| File | Requirement |
|---|---|
| `logo-64.png` | square, **256×256**, PNG |
| `logo-128.png` | byte-identical copy of `logo-64.png` (the plugin writes both on upload) |
| `logo-wide.png` | wide wordmark, ~439×126, PNG |

Source art in the repo: `content/assets/images/smallpe_logo.svg`, `smallpe_logo.jpg`,
`og_image.png`, and `agentic-team-for-private-equity/SmallPE-presentations/theme/assets/logo/
logo-wordmark-primary-tight-{light,dark}.svg`.

The sidebar seats are claimed by `dsh/vendor/smallpe-brand/client.js`, which is the
`dsbot-custom-brand` bundle rebranded: package name `@local/smallpe-brand`, row id
`smallpe-brand`, alt text `SmallPE`. It must keep the same slot/priority mechanism
(`sidebar.brand.mark` + `sidebar.brand.name` at priority −500, i.e. below DS Bot's −100).

## 5. Roster contract

`templates/bots.seed.json` — the installer reads this and creates one DS Bot agent per entry
via `POST /api/bot {"action":"create-bot", …}`.

```json
{
  "version": 1,
  "bots": [
    {
      "name": "Managing Partner",
      "role": "Managing Partner",
      "color": "deepseek",
      "avatar": { "shape": "whale" },
      "workspace": "agentic-team-for-private-equity",
      "main": true,
      "instructions": "<the agent's full system prompt>"
    }
  ]
}
```

* `workspace` is a path **relative to `$ROOT`**; the installer resolves it to an absolute path
  and passes it as `workDir` (DS Bot requires an absolute, existing folder — the installer
  `mkdir -p`s it first).
* `main: true` on exactly one entry (Managing Partner). The installer calls
  `{"action":"set-main","id":…,"main":true}` for it.
* **Do not** include `model`, `id`, `createdAt`, `appliedModel` — ids come from real sessions,
  and the model must fall back to the user's own DSH default.
* `instructions` is the agent's persona: use the existing
  `agentic-team-for-private-equity/agents/<agent>/CLAUDE.md` content (and for the Managing
  Partner, `agentic-team-for-private-equity/CLAUDE.md` + `soul.md`), condensed only where it
  is pure repetition. Preserve the substantive operating rules, output formats, and the
  "report to X" relationships. Prepend one line telling the agent its working folder.

`templates/bot-workspaces.json` — the agent → folder map used by the installer and docs:

```json
{ "version": 1, "main": "agentic-team-for-private-equity",
  "workspaces": { "Oracle": "agentic-team-for-private-equity/thesis-development", … } }
```

All workspace folders live **inside the repo**. Logos needs
`agentic-team-for-private-equity/financial-modeling/`, which the Lead has created.

## 6. Profile contract

`templates/profiles/web/package.json` must declare `dsh.profile.bundles` in this order
(layer order is significant — later bundles win):

```
@deepseek-ai/dsh-base
@deepseek-ai/dsh-web-app
dsh-custom-logo            # serves the branding images (required for the logo to appear)
smallpe-brand              # -> @local/smallpe-brand, draws the logo in the sidebar
ds-bot                     # the agent team
dsbot-auth-bridge          # only meaningful with dsh-ui-auth; harmless otherwise
dsh-browser-use-chromium   # Chrome DevTools browser tools
dsh-better-sidebar
@deepseek-ai/dsh-experimental-agent-team-profile
```

`dsh-ui-auth` is **deliberately NOT in the default profile**: the install is loopback-only and
must work with zero login friction. `dsh/patches/add-auth.yml` adds it (plus the bridge it
enables) for anyone exposing the UI publicly.

`templates/profiles/web/cordis.patch.yml` is the user patch layer. It must:
* set the `bot` row's `config.workspace` to the team workspace — use
  `!!js` / env so the absolute path is computed at run time, not baked in;
* keep `ui-theme: { preference: system }`, `locale: { preference: en }`,
  and `ui-brand-official: disabled: true`;
* ship the Mnemon local-only `persistenceStrategy` block **verbatim** if the mnemon bundles are
  included (`allowedProviderIds: [mnemon-native]`, `dataBoundary: local-only`);
* contain **no** provider rows, API keys, baseURLs, LAN IPs or model ids from the original author.

## 7. Non-negotiables

1. No secrets, memories, session transcripts, browser profiles, or `node_modules` committed.
2. No personal identity: no `parolkar`, no personal domains, no LAN IPs, no private model ids.
3. Everything resolves **relative to `$ROOT`** or `$DSH_HOME`; the folder must survive being
   cloned to any location.
4. `rm -rf $ROOT` (or `$ROOT/dsh`) must leave nothing behind on the host except the Node.js
   install itself.
