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
./bin/install.sh    # one time — installs the harness and the nine agents
./bin/run.sh        # start it; open http://127.0.0.1:3080
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
> `bin/install.sh` and `bin/run.sh` both refuse to run rather than let that happen.

---

## The workspace

**`agentic-team-for-private-equity/` is the workspace.** It is the source of truth for the
team — the agent definitions, deal workflows, templates, tools and memory all live there —
and it is where the collaborative work happens.

`bin/run.sh` starts the harness *inside* that folder. DeepSeek Harness treats its invoking
directory as the workspace root, so every session — yours and each agent's — runs there.
That means:

* you and all nine agents share one working directory and can see each other's files;
* when an agent hands work to another, the artefacts are already in the same place;
* a deal's documents, the MRL, the evidence tracker and the models sit together under one
  folder instead of being scattered.

Each agent still has a **domain subfolder** for its own outputs, which its prompt tells it to
use. Those subfolders are output conventions inside the shared workspace, not separate
working directories:

| Agent | Role | Outputs in |
|---|---|---|
| **Managing Partner** | Coordinates the pipeline, makes investment decisions | the workspace root |
| **Oracle** | Investment thesis and macro trend analysis | `thesis-development/` |
| **Helios** | Deal sourcing and screening | `deal-sourcing/` |
| **Athena** | Due diligence orchestration (supervises Prometheus + Themis) | `due-diligence/` |
| **Prometheus** | Business evaluation | `business-evaluation/` |
| **Themis** | Evidence verification | `evidence-verification/` |
| **Logos** | Financial modelling and valuation | `financial-modeling/` |
| **Hermes** | Financing and deal closing | `deal-closing/` |
| **Iris** | Impact investing strategy and accountability | `impact-investing/` |

The deal pipeline runs **Oracle → Helios → Athena → Logos → Hermes**, with Prometheus and
Themis working under Athena and Iris engaging cross-functionally. The Managing Partner is the
co-ordinator and is the team's Main Bot.

Each agent's prompt is derived from the original team definition in
[`smallpe-agent-swarm.yml`](agentic-team-for-private-equity/smallpe-agent-swarm.yml) and its
per-agent `CLAUDE.md`, both of which remain in the repository unchanged.

Every agent can read and write files, run shell commands, search the web, and use the
repository's own tools (`excel_to_markdown`, `pdf_to_markdown`, the pandoc PDF pipeline and
the Slidev presentation setup) exactly as the original agent definitions intend.

---

## What the install script does

`./bin/install.sh` is safe to re-run. In order it:

1. checks the Node.js version;
2. runs `npm ci` inside `dsh/` — installs the pinned DeepSeek Harness runtime and a pinned
   `pnpm`, both locally;
3. creates the harness home at `dsh/home` and seeds it from `dsh/templates/` — profile
   configuration, the SmallPE logo, an empty credentials store and an empty agent roster;
4. installs the profile's plugins with the local `pnpm`, into `dsh/home/profiles/web`;
5. creates the agent output folders inside the workspace;
6. **provisions the nine agents** by driving DS Bot's own API, so every agent gets a real
   session in the shared workspace;
7. prints how to start it.

If step 6 fails (usually a model or network hiccup), the harness itself still works —
re-run `./bin/install.sh`, or just `node dsh/scripts/provision-bots.mjs`.

Options:

```bash
./bin/install.sh --refresh-config   # also re-copy the shipped config over dsh/home
./bin/install.sh --skip-provision   # install the harness only, no agents
node dsh/scripts/provision-bots.mjs --force   # re-apply roles/instructions to existing agents
```

---

## Where everything lives

```
SmallPE/
├── bin/
│   ├── install.sh              one-time installer
│   └── run.sh                  start the harness
├── agentic-team-for-private-equity/   THE WORKSPACE: personas, workflows, templates, tools
└── dsh/
    ├── node_modules/           the DSH runtime + pnpm        (~890 MB, gitignored)
    ├── .pnpm-store/            pnpm's package store           (gitignored)
    ├── home/                   $DSH_HOME — ALL harness data   (gitignored)
    │   ├── branding/           logo-64.png, logo-128.png, logo-wide.png
    │   ├── profiles/web/       the harness profile and its plugins
    │   ├── bot/                the agent roster, their memory and conversations
    │   └── sessions/ storages/ logs/
    ├── templates/              shipped configuration (copied into home/ by install.sh)
    ├── vendor/                 local plugins the harness loads
    └── scripts/                provisioning and helper scripts
```

`dsh/home` is created fresh on your machine. It is the *only* place your conversations, your
memory, your credentials and your agent roster live — and it is gitignored, so it can never be
committed by accident.

---

## Choosing a model

The agents ship with **no model pinned**. Each one inherits whatever model you configure, so
the team works with your provider and your key — not the author's.

1. Start the harness: `./bin/run.sh`
2. Open <http://127.0.0.1:3080>
3. Go to **Settings → Models**, add your provider and API key, and choose a default model.
4. Open the Managing Partner and start working. The other agents are in the sidebar.

Prefer environment variables? DSH resolves keys from the launch environment, `./.env`, or
`dsh/home/.env`, so you can `export YOUR_PROVIDER_API_KEY=…` before `./bin/run.sh`. Keys
stored through the UI land in `dsh/home/.credentials.yaml` — never in this repository.

---

## Optional: put a login in front of it

The default install listens on `127.0.0.1` only and has **no login**, so it just works.

If you expose the UI to other people or beyond localhost, enable the auth plugin:

```bash
./dsh/scripts/enable-auth.sh
./bin/run.sh
```

`dsh-ui-auth` then generates an `admin` account and prints a one-time password to the console.
The `@local/dsbot-auth-bridge` plugin is already installed and opens exactly one route
(`POST /api/bot`) through that gateway, so the DS Bot panels keep working. To expose it behind
a reverse proxy, set the public URL explicitly:

```bash
DSH_PUBLIC_URL=https://smallpe.example.com/ DSH_TRUSTED_HOST=smallpe.example.com ./bin/run.sh
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
macOS, Linux and Windows or between architectures — `./bin/install.sh` handles that for you.

---

## Troubleshooting

**`./bin/run.sh` starts but nothing appears in the browser, and nothing is printed.**
Almost always an old Node.js. Run `node --version`; you need ≥ 22.19.

**No agents in the sidebar.**
Provisioning did not complete. Run `node dsh/scripts/provision-bots.mjs` and read its output.
If it reports that the server did not become ready, start `./bin/run.sh` once in another
terminal and retry — the script reports the server's own log tail on failure.

**A plugin install fails during `./bin/install.sh`.**
Run the underlying command to see the raw error:
`cd dsh/home/profiles/web && ../../node_modules/.bin/pnpm install`.

**"pnpm was not found".**
The profile's plugins are installed with the local pnpm. Make sure you are running through
`./bin/install.sh` (which puts `dsh/node_modules/.bin` first on `PATH`), not a bare `dsh`
command.

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

* **`$DSH_HOME`** relocates *all* harness state. `bin/run.sh` points it at `dsh/home`, and DSH
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
your machine through DS Bot's own API. The result is a first-class roster — real sessions, all
in the shared workspace, ready to work — with none of the author's conversations, memory or
secrets.

---

## Licence

The SmallPE agent definitions and this integration are distributed under the repository's
existing licence (see `LICENSE`). DeepSeek Harness and the third-party plugins are the
property of their respective authors.
