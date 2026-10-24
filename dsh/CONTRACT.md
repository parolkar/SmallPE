# SmallPE × DeepSeek Harness — integration contract

Reference for anyone maintaining this integration. It records the exact layout and the
interfaces between `bin/install.sh`, `bin/run.sh`, the profile templates and the
`dsh/vendor/` plugins — the names and paths below are load-bearing, because the profile's
dependency specifiers, the branding route and the workspace root all resolve **relatively**
and will break if the layout moves.

If you change something here, re-run `./dsh/scripts/verify-install.sh` afterwards.

`$ROOT` below is the cloned `SmallPE/` folder. Nothing in this integration may hardcode an
absolute host path, a username, a hostname, or a port.

---

## 1. Goal

Clone `SmallPE` → run `./bin/install.sh` → run `./bin/run.sh` → a locally-installed DeepSeek
Harness opens in the browser and the **whole SmallPE agent team is already present as DS Bot
agents** (Managing Partner + 8 specialists), all working in the shared workspace inside this
repo.

Only host prerequisite: **Node.js ≥ 22.19** (and `git`). No global pnpm, no `npx`, no Ruby.

## 2. Layout (fixed)

```
$ROOT/
├── bin/
│   ├── install.sh                 # one-time setup
│   └── run.sh                     # launch the web UI (in the team workspace)
├── DSH-README.md                  # user documentation
├── .gitignore                     # extended for dsh/
├── agentic-team-for-private-equity/   # EXISTING — the DSH workspace: personas + workflows
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
    │   ├── skills/<name>/SKILL.md # global skills, installed to $DSH_HOME/skills
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

* `bin/install.sh` and `bin/run.sh` both **pin** `DSH_HOME="$ROOT/dsh/home"`. It is deliberately
  never inherited: a nested DSH session exports its own `DSH_HOME`, and honouring that would
  point the harness at somebody else's home. `SMALLPE_DSH_HOME` is the only override, and
  `bin/install.sh` refuses to run if the resolved home is outside `$ROOT`.
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
* `bin/run.sh` prepends `$ROOT/dsh/node_modules/.bin` to `PATH` — the CLI `dsh plugin` always
  resolves `pnpm` from `PATH`, so a folder-local pnpm must win over any global one.

## 3b. The workspace (critical)

* `agentic-team-for-private-equity/` is the DeepSeek Harness **workspace**: the source of truth
  for the team, and the single working directory for the user's sessions and every agent's.
* DSH treats the **invoking directory** as the default workspace root. So `bin/run.sh` must
  `cd "$SMALLPE_TEAM_WORKSPACE"` before exec'ing `dsh`, and `provision-bots.mjs` must spawn its
  throwaway server with the same `cwd` (otherwise the workspace id recorded in `storages/` and
  in the roster belongs to the wrong folder).
* Every agent's `workDir` is that same folder, so DS Bot stores no per-agent `workDir` at all
  (its `workFolder()` returns `undefined` when a path equals the team workspace). Agents keep
  their domain subfolders as **output conventions only** — see the `outputs` field in §5.
* Anything a plugin writes next to the working directory (the optional `dsh-ui-auth`
  session/audit files) therefore lands in the workspace; those names are gitignored.

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

## 4b. Skills

Skills go in `$DSH_HOME/skills/<name>/SKILL.md` (shipped from `dsh/templates/skills/`). That root
is one of the filesystem roots `dsh-skill-filesystem` scans, and it is **global**: every agent in
the profile and every DS Bot session sees what is there, which is why a skill belongs there and
not in a bot's inline `capabilities`.

The file needs YAML frontmatter with `name` and `description`; the name must be kebab-case
(`/^[a-z0-9]+(?:-[a-z0-9]+)*$/`) and the directory name should match it. `disable-model-invocation`
and `user-invocable` are the invocation switches, and both default to enabled. A malformed or
frontmatter-less file is ignored with a `skill file ... ignored` warning rather than failing the
boot, so check the startup log if a skill does not appear.

Only declare a skill under `dsh/templates/skills/` if everyone who clones the repository should
have it; the installer never touches skills a user adds under `$DSH_HOME/skills/` themselves.

Verify with the harness's own API once it is running — `POST /api/skills/list` with the
client-request envelope returns the catalog for one session:

```json
{"type":"client-request","rpcId":"probe","method":"skills/list",
 "payload":{"args":{"request":{"sessionId":"session-…"}}}}
```

## 5. Roster contract

`templates/bots.seed.json` — the installer reads this and creates one DS Bot agent per entry
via `POST /api/bot {"action":"create-bot", …}`.

```json
{
  "version": 1,
  "workspace": "agentic-team-for-private-equity",
  "bots": [
    {
      "name": "Managing Partner",
      "role": "Managing Partner",
      "color": "green",
      "avatar": { "shape": "pebbles" },
      "workspace": "agentic-team-for-private-equity",
      "outputs": "",
      "main": true,
      "instructions": "<the agent's full system prompt>"
    }
  ]
}
```

* `workspace` is the shared team workspace, a path **relative to `$ROOT`**. All nine agents use
  the same value, so they all work in one folder and can see each other's files. The installer
  resolves it to an absolute path and passes it as `workDir`; DS Bot then stores no per-agent
  `workDir`, because a path equal to the team workspace means "work in the team workspace".
  The folder must exist first — the installer `mkdir -p`s it.
* `outputs` is the agent's domain subfolder **inside** that workspace — documentation only. It
  tells the agent (and the reader) where its artefacts belong; the installer never uses it as a
  working directory. Managing Partner's is `""` (it works at the workspace root).
* `main: true` on exactly one entry (Managing Partner). The installer calls
  `{"action":"set-main","id":…,"main":true}` for it.
* `color` + `avatar.shape` together are the agent's look: DS Bot fills the shape's body with
  the bot's colour, so `"color": "green"` with `"shape": "pebbles"` renders as green pebbles.
  `shape` must name a character DS Bot actually ships — currently `acorn`, `beacon`, `bunny`,
  `cushion`, `gem`, `gumdrop`, `kitty`, `magnet`, `peanut`, `pebbles`, `plus`, `ring`,
  `saucer` (see `CHARACTERS` in ds-bot's client bundle); an unknown name silently falls back
  to a default shape. A bot with no `avatar` gets a shape derived from its session id, so only
  agents that should look deliberate need one. `color` must be one of DS Bot's own colour
  names. `--force` re-applies both, which is how an existing install picks up a changed look —
  and it needs every other DSH instance closed first, because a running one holds the team lock.
* **Do not** include `model`, `id`, `createdAt`, `appliedModel` — ids come from real sessions,
  and the model must fall back to the user's own DSH default.
* `instructions` is the agent's persona, and it is derived from **two** sources, in this order
  of authority:
  1. `agentic-team-for-private-equity/smallpe-agent-swarm.yml` — the original agent prompts.
     This is the primary source of truth and must never be edited.
  2. the per-agent `CLAUDE.md` files (plus `CLAUDE.md`, `soul.md` and `agents/managing-partner.md`
     for the Managing Partner), which carry the fuller role definitions.
  Nothing substantive from the swarm prompts may be dropped; keep the `tools/` behaviours, the
  PDF pipeline, the markdown-for-PDF rules and the Slidev workflow. The first line must state
  the shared workspace and the agent's `outputs` subfolder.

`templates/bot-workspaces.json` records the same mapping for docs and tooling:

```json
{ "version": 1,
  "workspace": "agentic-team-for-private-equity",
  "main": "agentic-team-for-private-equity",
  "workspaces": { "Oracle": "thesis-development", … } }
```

All workspace folders live **inside the repo**. Logos needs
`agentic-team-for-private-equity/financial-modeling/`.

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
must work with zero login friction. `dsh/scripts/enable-auth.sh` adds it (plus the bridge it
enables) for anyone exposing the UI publicly.

`templates/profiles/web/cordis.patch.yml` is the user patch layer. It must:
* set the `bot` row's `config.workspace` to the team workspace — use
  `!!js` / env so the absolute path is computed at run time, not baked in;
* configure exactly **two** providers on the `llm-pi-ai` row — `local` (a hand-declared,
  OpenAI-compatible route whose base URL and model id come from `SMALLPE_LOCAL_BASE_URL` /
  `SMALLPE_LOCAL_MODEL`) and `openrouter`. A hand-declared route is not in DSH's model catalog,
  so `local` **must** list at least one model or the route reports a configuration error;
* disable the vendor's own routes and the modal that fronts them:
  `llm-deepseek` (API-key provider), `llm-deepseek-account`, and `ui-settings-account` (the
  account surface that owns the "Get started / Sign in to DeepSeek" dialog), and repoint
  `agent-default-model` off the provider that disabling removes;
* pre-acknowledge the harness "Preview Notice" by recording the shipped notice version on
  `ui-settings-general.welcomeNoticeVersion`, so a first run opens straight into the team;
* keep `ui-theme: { preference: system }`, `locale: { preference: en }`,
  and `ui-brand-official: disabled: true`;
* ship the Mnemon local-only `persistenceStrategy` block **verbatim** if the mnemon bundles are
  included (`allowedProviderIds: [mnemon-native]`, `dataBoundary: local-only`);
* carry **no** credentials, no LAN addresses and no personal identifiers. Model ids and
  provider base URLs that ship are deliberate public defaults (OpenRouter's API host and
  localhost), not the original author's private endpoints — never reintroduce those.

## 7. Non-negotiables

1. No secrets, memories, session transcripts, browser profiles, or `node_modules` committed.
2. No personal identity: no `parolkar`, no personal domains, no LAN IPs, no private model ids.
3. Everything resolves **relative to `$ROOT`** or `$DSH_HOME`; the folder must survive being
   cloned to any location.
4. `rm -rf $ROOT` (or `$ROOT/dsh`) must leave nothing behind on the host except the Node.js
   install itself.
