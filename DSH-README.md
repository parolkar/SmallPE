# SmallPE on DeepSeek Harness

Run the **SmallPE agent team** — a Managing Partner plus eight specialist private-equity
agents — as a local, self-contained [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)
installation.

Clone the repository, run one install script, and you get a private web workspace on your
own machine where the whole investment team is already assembled and ready to work. Nothing
is installed globally: everything lives inside this folder, and deleting the folder removes
it completely.

```bash
git clone <this-repo> SmallPE
cd SmallPE
./install.sh        # one time — installs the harness, branding and agent team
./run.sh            # start it; open http://127.0.0.1:3080
```

---

## Requirements

| | |
|---|---|
| **Node.js ≥ 22.19** | the only host prerequisite. Check with `node --version`. |
| `git` | to clone the repository. |
| ~1.8 GB free disk | the harness runtime, its plugins and the local package store, all inside `dsh/` (measured: runtime ~890 MB, pnpm store ~600 MB, profile plugins ~300 MB). |
| A model API key | bring your own; see [Choosing a model](#choosing-a-model). |

Ruby is **not** needed for the agent harness. It is only used by the original Nanoc
website in `content/`, `layouts/` and `lib/`.

> **Do not use Node older than 22.19.** DSH's entry point is guarded by
> `import.meta.main`, which does not exist before Node 22.18. On an older Node the CLI
> exits successfully having done nothing at all — the most confusing failure mode there is.
> `install.sh` and `run.sh` both refuse to run rather than let that happen.

---

## The team

All nine agents are created inside DeepSeek Harness's **DS Bot** on first install, each with
its own role, its own system prompt and its own working folder inside this repository.

| Agent | Role | Works in |
|---|---|---|
| **Managing Partner** | Coordinates the whole pipeline, makes investment decisions | `agentic-team-for-private-equity/` |
| **Oracle** | Investment thesis and macro trend analysis | `…/thesis-development/` |
| **Helios** | Deal sourcing and screening | `…/deal-sourcing/` |
| **Athena** | Due diligence orchestration (supervises Prometheus + Themis) | `…/due-diligence/` |
| **Prometheus** | Business evaluation | `…/business-evaluation/` |
| **Themis** | Evidence verification | `…/evidence-verification/` |
| **Logos** | Financial modelling and valuation | `…/financial-modeling/` |
| **Hermes** | Financing and deal closing | `…/deal-closing/` |
| **Iris** | Impact investing strategy and accountability | `…/impact-investing/` |

The deal pipeline runs **Oracle → Helios → Athena → Logos → Hermes**, with Prometheus and
Themis working under Athena and Iris engaging cross-functionally. The Managing Partner is the
co-ordinator and is the team's Main Bot.

Every agent can read and write files, run shell commands, search the web, and use the
repository's own tools (`excel_to_markdown`, `pdf_to_markdown`, the pandoc PDF pipeline and
the Slidev presentation setup) exactly as the original agent definitions intend. Their full
personas are also still on disk under `agentic-team-for-private-equity/agents/`, so nothing
about the original project is lost.

---

## What the install script does

`./install.sh` is safe to re-run. In order it:

1. checks the Node.js version;
2. runs `npm ci` inside `dsh/` — installs the pinned DeepSeek Harness runtime and a pinned
   `pnpm`, both locally;
3. creates the harness home at `dsh/home` and seeds it from `dsh/templates/` — profile
   configuration, the SmallPE logo, an empty credentials store and an empty agent roster;
4. installs the profile's plugins with the local `pnpm`, into `dsh/home/profiles/web`;
5. creates each agent's working folder inside the repository;
6. **provisions the nine agents** by driving DS Bot's own API, so every agent gets a real
   session and a real working folder;
7. prints how to start it.

If step 6 fails (usually a model or network hiccup), the harness itself still works —
re-run `./install.sh`, or just `node dsh/scripts/provision-bots.mjs`.

Options:

```bash
./install.sh --refresh-config     # also re-copy the shipped config over dsh/home
./install.sh --skip-provision     # install the harness only, no agents
node dsh/scripts/provision-bots.mjs --force   # re-apply roles/instructions to existing agents
```

---

## Where everything lives

```
SmallPE/
├── install.sh                  one-time installer
├── run.sh                      start the harness
├── agentic-team-for-private-equity/   agent personas, workflows, templates, tools
└── dsh/
    ├── node_modules/           the DSH runtime + pnpm        (~900 MB, gitignored)
    ├── .pnpm-store/            pnpm's package store           (gitignored)
    ├── home/                   $DSH_HOME — ALL harness data   (gitignored)
    │   ├── branding/           logo-64.png, logo-128.png, logo-wide.png
    │   ├── profiles/web/       the harness profile and its plugins
    │   ├── bot/                the agent roster, their memory and conversations
    │   └── sessions/ storages/ logs/
    ├── templates/              shipped configuration (copied into home/ by install.sh)
    ├── vendor/                 local plugins: SmallPE branding, auth bridge, Chrome tools
    └── scripts/                provisioning and helper scripts
```

`dsh/home` is created fresh on your machine. It is the *only* place your conversations, your
memory, your credentials and your agent roster live — and it is gitignored, so it can never be
committed by accident.

---

## Choosing a model

The agents ship with **no model pinned**. Each one inherits whatever model you configure, so
the team works with your provider and your key — not the author's.

1. Start the harness: `./run.sh`
2. Open <http://127.0.0.1:3080>
3. Go to **Settings → Models**, add your provider and API key, and choose a default model.
4. Open the Managing Partner and start working. The other agents are in the sidebar.

Prefer environment variables? DSH resolves keys from the launch environment, `./.env`, or
`dsh/home/.env`, so you can `export YOUR_PROVIDER_API_KEY=…` before `./run.sh`. Keys stored
through the UI land in `dsh/home/.credentials.yaml` — never in this repository.

---

## Branding

The sidebar shows the SmallPE logo instead of the default DSH branding. This is delivered by
two plugins working together:

* **`dsh-custom-logo`** serves images from `dsh/home/branding/` on the `/custom-logo` route.
  It reads the filenames `logo-64.png`, `logo-128.png` and `logo-wide.png` — to change the
  logo, replace those files (square mark ≈ 256×256, wide wordmark ≈ 439×126) and reload.
* **`@local/smallpe-brand`** (`dsh/vendor/smallpe-brand/`) claims the sidebar's brand seats
  and draws them. It claims at a low priority so it wins over the DS Bot mark, and re-claims
  if another plugin takes the seat afterwards.

---

## Optional: put a login in front of it

The default install listens on `127.0.0.1` only and has **no login**, so it just works.

If you expose the UI to other people or beyond localhost, enable the auth plugin:

```bash
./dsh/scripts/enable-auth.sh
./run.sh
```

`dsh-ui-auth` then generates an `admin` account and prints a one-time password to the console.
The `@local/dsbot-auth-bridge` plugin is already installed and opens exactly one route
(`POST /api/bot`) through that gateway, so the DS Bot panels keep working. To expose it behind
a reverse proxy, set the public URL explicitly:

```bash
DSH_PUBLIC_URL=https://smallpe.example.com/ DSH_TRUSTED_HOST=smallpe.example.com ./run.sh
```

Without those variables no external authority is trusted, which is the correct default.

---

## What is *not* folder-local

The harness keeps essentially all of its state in `dsh/home`. A few third-party components
write small caches under your home directory, and they cannot be redirected:

| Item | Location | Note |
|---|---|---|
| `chrome-devtools-mcp` telemetry | `~/Library/Application Support/chrome-devtools-mcp/` | one small file; not reachable from a CLI flag |
| `chrome-devtools-mcp` browser cache | `~/.cache/chrome-devtools-mcp/` | only when the Chrome tools run |
| tool output spill files | `$TMPDIR/dsh-spill-*` | swept automatically |
| LibreOffice font cache | `~/Library/Caches/libreoffice-kit` | only when office/PDF skills run |
| npm's download cache | `~/.npm` | used once at install time |

None of these hold your conversations, your memory, your agent roster, or your keys — all of
that is inside `dsh/home`.

**Platform note.** The install is built for the machine it runs on. Some native dependencies
are platform-specific, so install per platform rather than copying `node_modules` between
macOS, Linux and Windows or between architectures — `./install.sh` handles that for you.

---

## Troubleshooting

**`./run.sh` starts but nothing appears in the browser, and nothing is printed.**
Almost always an old Node.js. Run `node --version`; you need ≥ 22.19.

**The sidebar shows the default DeepSeek branding, not the SmallPE logo.**
Check that `dsh/home/branding/` contains all three PNGs and restart. If they are there, a
harness upgrade may have changed an upstream CSS class — re-run `./install.sh --refresh-config`.

**No agents in the sidebar.**
Provisioning did not complete. Run `node dsh/scripts/provision-bots.mjs` and read its output.
If it reports that the server did not become ready, start `./run.sh` once in another terminal
and retry — the script reports the server's own log tail on failure.

**A plugin install fails during `./install.sh`.**
Run the underlying command to see the raw error:
`cd dsh/home/profiles/web && ../../node_modules/.bin/pnpm install`.

**"pnpm was not found".**
The profile's plugins are installed with the local pnpm. Make sure you are running through
`./install.sh` (which puts `dsh/node_modules/.bin` first on `PATH`), not a bare `dsh` command.

---

## Uninstalling

```bash
rm -rf SmallPE            # everything, including the harness and all agent data
```

`dsh/node_modules`, `dsh/.pnpm-store` and `dsh/home` all live inside the repository, so
nothing is left behind except the small third-party caches listed above.

---

## How this works, and why it is built this way

Three properties of DeepSeek Harness make a portable install possible, and one makes the agent
roster interesting:

* **`$DSH_HOME`** relocates *all* harness state. `run.sh` points it at `dsh/home`, and DSH
  resolves it ahead of the default `~/.dsh`.
* **A local `npm install`** of `@deepseek-ai/dsh` gives a relocatable `dsh/node_modules/.bin/dsh`
  with no absolute paths baked in — unlike `npx`, which unpacks into a hash-named cache under
  `$HOME` with no lockfile.
* **A local `pnpm` first on `PATH`**, plus `storeDir` in the profile's `pnpm-workspace.yaml`,
  keeps plugin installs and pnpm's package store inside the repository. (`storeDir` is the only
  one of the four possible pnpm mechanisms that actually works — the environment variables are
  silently ignored.)

The roster is the interesting part. **A DS Bot agent's `id` is the session id of its first own
chat**, and a missing session is a hard error rather than a fresh start. So the roster cannot be
shipped as a static file: its ids would only be valid alongside the author's private session
transcripts, which must never be distributed. Instead the repository ships a declarative seed
(`dsh/templates/bots.seed.json`) and `dsh/scripts/provision-bots.mjs` recreates the agents on
your machine through DS Bot's own API. The result is a first-class roster — real sessions, real
folders, ready to work — with none of the author's conversations, memory or secrets.

---

## Licence

The SmallPE agent definitions and this integration are distributed under the repository's
existing licence (see `LICENSE`). DeepSeek Harness and the third-party plugins are the
property of their respective authors.
