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

# optional, once — a username/password login instead of the per-start token:
./dsh/scripts/enable-auth.sh

./bin/run.sh        # start it, then open the URL it prints (see below)
```

### Which URL to open

This trips up everyone once, so `bin/run.sh` now tells you in its banner. There are two
modes, and they want different URLs:

| | open | why |
|---|---|---|
| **default** (no `enable-auth.sh`) | the **`dsh web: http://…/?token=…`** line printed a moment after the banner | DSH mints a **new launch token on every start**; only that URL exchanges it for a cookie |
| **with `./dsh/scripts/enable-auth.sh`** | the plain **<http://127.0.0.1:3080>** | the `dsh-ui-auth` gateway serves a login page and replays the token exchange for you |

In the default mode, opening the plain address before the token URL returns one line of
text and nothing else:

```
dsh web authentication required; reopen the URL printed by dsh web.
```

That is not a broken install — it is a missing token. Open the `dsh web:` line instead; it
sets a cookie, redirects to the clean URL, and the plain address works from then on until
the cookie expires (it is signed by a durable secret in `dsh/home/.credentials.yaml`, so it
survives restarts).

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

## Skills

One skill ships with the install, and it is **global** — every agent in DS Bot and every
session in the profile can see it:

| Skill | What it does |
|---|---|
| `inloop-organization-brain` | Query Inloop.Studio's Digital Brain, and submit a conversation as organization learning when you ask for it |

Skills live in **`dsh/home/skills/<name>/SKILL.md`**: one directory per skill, with `name` and
`description` in the YAML frontmatter. DSH watches that folder, so dropping another one in is
picked up without a restart. Add one to `dsh/templates/skills/` instead to ship it to everyone
who clones the repository, and re-run `./bin/install.sh --refresh-config` on an existing
install to pick it up.

Any skill you write locally in `dsh/home/skills/` is yours — the installer leaves it alone.

---

## Document conversion (Pandoc)

Pandoc is mounted as an **MCP server**, so every agent gets its document-conversion tools
(the model sees them as `mcp__pandoc__*`) alongside the PDF pipeline its prompt already
describes. It is declared as one plugin row in
`dsh/home/profiles/web/cordis.patch.yml` — DSH has no MCP settings screen and reads no
`mcp.json`, so a patch row *is* how an MCP server is added.

It needs two things that do **not** ship with this repository, both on `PATH`:

| Needed | For | Get it from |
|---|---|---|
| `uvx` | launching the MCP server | [uv](https://docs.astral.sh/uv/) |
| `pandoc` | doing the conversion | [pandoc.org](https://pandoc.org/installing.html) |
| a PDF engine — `xelatex` or `tectonic` | PDF output only | `tectonic` is a single small binary; TeX Live is multi-GB |

Without them the harness still starts and everything else works — only the `mcp__pandoc__*`
tools are missing, and the startup log names the reason (`spawn uvx ENOENT`). Set
`failOnStartupError: true` on that row if you would rather the harness refuse to start.

The repository root also carries an `mcp.json` in Claude/Cursor format. DSH ignores that file
completely; it is kept for editors that use it.

### The PDF pipeline

One command, no preprocessing and no environment exports:

```bash
cd agentic-team-for-private-equity
pandoc --defaults=templates/pandoc-defaults.yml report.md -o report.pdf
```

Three things that used to make this fail, now fixed at the source rather than worked around
in each deal folder:

* **The body font.** `pandoc-defaults.yml` asked for `mainfont: "Charter"` — a font fontspec
  looks for on the *system*. macOS has it, Debian does not, so every container build died
  with `! Package fontspec Error: The font "Charter" cannot be found.` All three faces now
  come from `templates/brand-fonts.tex`, generated by `install-tools.sh` from the TTFs this
  repo ships, so the output is identical on a laptop and in the container.
* **The documented header override.** `-V header-includes='\fancyhead…'` is emitted *before*
  the include-in-header files, so it lands ahead of `\usepackage{fancyhdr}` and fails with
  `! Undefined control sequence`. Put the override in a file and pass `-H` instead.
* **The "mandatory" `sed`.** It replaced unicode arrows that Charter lacked. Inter has them,
  so it is gone — measured: `→` renders and survives extraction.

**Speed.** On a cold cache the first PDF takes **5m49s**, because tectonic fetches the whole
LaTeX package set; warm it takes **1.5s**. The image now warms that ~44MB cache at build
time and `container-start.sh` seeds the volume from it, so an agent's first document does
not stall for six minutes or need network at that moment.

**Inspecting a PDF.** The image ships `poppler-utils`: `pdfinfo report.pdf` for page count
and size, `pdftotext report.pdf -` for the text layer.

### The Ruby tools

`tools/pdf_to_markdown/pdf2md` and `tools/excel_to_markdown/excel2md` are Ruby, and every
agent persona instructs agents to use them — but the image had no Ruby, so the documentation
was false and agents hand-rolled replacements mid-job. The image now installs Ruby and both
gem sets **system-wide**, because both scripts do a bare `require 'thor'` with no
`bundler/setup` and the docs call them directly, which a vendored bundle would not satisfy.
The build smoke-tests both, so a missing gem fails the build rather than an agent.

Verified: `pdf2md` reads our own tectonic-generated PDFs correctly, metadata and page count
included. If you meet a note anywhere claiming otherwise, it is describing a hand-rolled
shim that lacked ToUnicode support, not these tools.

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

The agents ship with **no model pinned** to the author's provider, and the harness does not ask
you to sign in to anything — the vendor sign-in prompt is switched off. **Two providers are
configured for you:**

| Provider | What it is | What you do |
|---|---|---|
| **Local** | Any OpenAI-compatible model server on this machine (LM Studio, Ollama, llama.cpp, vLLM, MLX…) at `http://127.0.0.1:1234/v1` | Point it at your server and name your model — see below |
| **OpenRouter** | One key, hundreds of models ([openrouter.ai/keys](https://openrouter.ai/keys)) | Set `OPENROUTER_API_KEY`, or add the key in Settings → Models |

Three models are **recommended** and appear in the model picker, so choosing one is a
three-way decision rather than a four-hundred-way one:

| Model | Context |
|---|---|
| `deepseek/deepseek-v4.1-flash` *(the default)* | 1,048,576 |
| `anthropic/claude-opus-5.5` | 1,000,000 |
| `openai/gpt-6-astra` | 1,050,000 |

Only their ids are written down. Everything else about each one — context window, output
limit, image support, display name and thinking levels — is taken from the harness's own
catalog, so there are still no numbers to maintain and a model's context length stays
automatic.

**Want another model?** Open **Settings → Models** and add it. The OpenRouter endpoint stays
discoverable there — **all 401 models** are listed — and adding one leaves your existing
choices alone. Until an OpenRouter key exists the provider has no models to offer, which is
expected.

Change the default in **Settings → Models**, or in `dsh/home/profiles/web/cordis.patch.yml`.

### Using a local model server

Open **Settings → Models → Local** and set your server's base URL (for Ollama,
`http://127.0.0.1:11434/v1`), then **Fetch models** to pick the model it serves. Defaults: base
URL `http://127.0.0.1:1234/v1`, model id `local-model`, context window `32768`, max output
`8192`. You can also edit them on the `llm-pi-ai` row of `dsh/home/profiles/web/cordis.patch.yml`
— as plain values only: a `!!js` expression on that row makes every save from Settings →
Models fail with `$.providers.local.baseURL expected string but got [object Object]`.

A local server is the one case where nothing can be automatic — no catalog describes the
models you have downloaded — so those two numbers are declared conservatively. **Set the
context window to your model's real one**: too high and the harness overflows upstream with a
confusing provider error instead of compacting in time. **Settings → Models** can interrogate
your endpoint and fill them in.

The API key is a placeholder: a local server ignores it, but OpenAI-compatible clients insist
on sending one, so `bin/run.sh` defaults `SMALLPE_LOCAL_API_KEY` to `local`.

### Using OpenRouter

```bash
OPENROUTER_API_KEY=sk-or-... ./bin/run.sh
```

Prefer the UI? Open the harness ([which URL?](#which-url-to-open)), go to
**Settings → Models**, and paste the key there. Keys entered that way land in `dsh/home/.credentials.yaml` — never in this repository.
DSH also reads keys from the launch environment, `./.env` and `dsh/home/.env`.

## Zapier

The hosted Zapier MCP server is wired in and enabled by default: its row mounts at the harness
root, so Zapier's tools are available to **every** agent and session — including DS Bot. You
need a Zapier token from your [hosted MCP server](https://mcp.zapier.com/):

1. Open **Settings → Zapier MCP** and paste the token. It is stored in the harness credential
   store (`dsh/home/.credentials.yaml`) — never in a config file — and the page re-connects
   immediately, reporting how many tools it found.
2. Until a token exists the plugin is idle: the harness boots normally and everything else
   works; only Zapier's tools are absent.

Advanced (self-hosted endpoint) options live on the same page.

### Zapier with more than one user

`dsh-zapier-mcp` is single-tenant: one `credentialRef`, one connection with the token
baked into the URL, and tools registered on the **root** context so `mcp__zapier__*`
exists in every session. With a login enabled that means everyone's work runs against
whoever's token was entered. `@local/smallpe-zapier-scope` fixes that:

| Tools | Token | Who can execute |
|---|---|---|
| `mcp__zapier__*` | `ZAPIER_MCP_TOKEN` — the **firm's** token | anyone; this is what the shared DS Bot agents use |
| `mcp__zapier_<user>__*` | `ZAPIER_MCP_TOKEN__<user>` — that person's own | **only sessions owned by that user** |

A user stores their own token under `ZAPIER_MCP_TOKEN__<username>`; a narrow policy lets
them write that one reference and nothing else. Verified live: john can set
`ZAPIER_MCP_TOKEN__john`, and is refused `ZAPIER_MCP_TOKEN__admin`, the firm-wide
`ZAPIER_MCP_TOKEN`, and `OPENROUTER_API_KEY`.

**The boundary is execution, not visibility.** Tool names are global in DSH — there is no
per-session registration seam — so every session can *see* every user's Zapier tool names.
Each personal connection is therefore mounted beneath a fiber that shadows the `tools`
service, so the MCP client's own registrations pass through a wrapper that checks
`uiAuth.ownerOfSession(...)` on every call and fails closed when the caller cannot be
identified.

> **The shared DS Bots deliberately use the firm's token, not yours.** Their sessions are
> owned by `admin` and shared with everyone, so a call from one carries no evidence of who
> prompted it — `ownerOfSession` answers `admin` whoever is driving. Per-user tokens and
> shared agents cannot both hold for the same session, so personal tokens apply to your
> **own** sessions and the shared team keeps a firm credential. A personal connection
> invoked from a shared agent is refused rather than silently falling back.

Without dsh-ui-auth the plugin does nothing: there are no users, and the stock
single-token behaviour is correct.

---

## Optional: put a login in front of it

The default install listens on `127.0.0.1` only and has **no login** beyond DSH's own
per-start launch token, so it just works.

Enable the auth plugin if you expose the UI to other people or beyond localhost — or simply
if you would rather sign in once than copy a fresh token URL on every start:

```bash
./dsh/scripts/enable-auth.sh    # once; installs dsh-ui-auth into the 'web' profile
./bin/run.sh
```

On that first start `dsh-ui-auth` creates an `admin` account and prints a one-time password.
**Its log output is Chinese only** — look for the `[dsh-ui-auth]` block and read `用户名` as
username, `密码` as password. The same credentials are written to
`agentic-team-for-private-equity/dsh-ui-auth-bootstrap.txt` (gitignored, alongside the
session and audit files it keeps there). Change the password after you sign in; the
bootstrap file disappears once you do.

Then open the plain <http://127.0.0.1:3080> — with the gateway installed there is no token
to copy. It owns the listener, serves its own login page, and mints DSH's native cookie
server-side for every request it forwards, which is why the Railway deployment never shows
the token prompt either.

### Per-user workspaces

With the gateway on, every account gets **its own workspace**, and the DS Bot team folder
is **shared by everyone**. `@local/smallpe-user-workspaces` reconciles this at startup and
then every 30s, so a user who registers with an invite code is provisioned shortly after
without a restart.

```
$DATA/workspace             the shared DS Bot team folder — all nine agents, everyone sees it
$DATA/workspaces/admin      admin's own space
$DATA/workspaces/john       john's own space, invisible to everyone else
```

Note the plural: personal workspaces are a **sibling** of the team folder, never inside it.
Locally the root is `./workspaces/` (gitignored); override with
`SMALLPE_USER_WORKSPACES_ROOT`, and the interval with `SMALLPE_USER_WORKSPACES_INTERVAL_MS`.

Each pass creates the directory, registers it with DSH, and claims it for that user through
`uiAuth.claimWorkspace`. Every step is idempotent, and a workspace already owned by somebody
else is never taken — it logs once and moves on.

**Why the team folder needs a patch.** dsh-ui-auth scopes everything through two predicates
in `modern-policy.js` (`session` and `workspace`), and ownership is strictly single-owner —
`claimOwner` throws *"Object already belongs to another user"*. `registerPolicy` cannot help
either: of the five kinds `PolicyRules` declares, only `http`, `rpc` and `upgrade` are ever
dispatched, so the `workspace/follow` frame projection that builds the sidebar is
unreachable and the team workspace would be authorised but invisible.
`dsh/scripts/patch-ui-auth-sharing.mjs` therefore teaches those two predicates one extra way
to say yes — an id listed in:

```
$DSH_HOME/smallpe-shared-scope.json    { "workspaces": [...], "sessions": [...] }
```

The plugin rewrites that file every pass, so sessions the agents create join the shared set
within one interval. `enable-auth.sh` applies the patch, covering the local opt-in and the
container image alike. **Re-run it after any `dsh plugin add dsh-ui-auth`.**

> **This widens access on purpose.** Every signed-in user — not only admins — can read and
> write every file in the shared team folder and drive all nine agents, model spend
> included. That is the intent: the DS Bots are shared colleagues. Nothing else changes —
> unlisted workspaces and sessions stay private to their owner, and a missing or malformed
> scope file shares **nothing**, so the failure direction is closed. What is shared is
> always auditable with `cat $DSH_HOME/smallpe-shared-scope.json`.

### What a non-admin user can do

With the login on, dsh-ui-auth gates almost everything to admins. Three of its defaults
are wrong for a shared agent team, so `patch-ui-auth-sharing.mjs` adjusts them:

| | Stock dsh-ui-auth | SmallPE |
|---|---|---|
| **The team workspace** | owner-only; invisible to everyone else | shared with all users |
| **DS Bot** | `/api/bot` is admin-only, so the panel hangs on *"Setting up your Main Bot…"* forever | users may call `state`, `agent-session`, `thinking` |
| **Models** | a user with no model profile of their own gets an empty catalogue and can run nothing | the deployment's routes (`SMALLPE_DEFAULT_PROVIDERS`, default `openrouter`) work for everyone |

**DS Bot.** It posts every operation to the one route `/api/bot`, naming it in the body, so
the bridge authorizes per operation — which needs the body, which the gateway does not hand
to an `http` policy. The patch buffers it and replays it to the forward, reusing the
module's own `bodyOf`/`replay`. Users get the three endpoints that load the team and talk to
the agents. Roster changes (`add-agent`, `remove-agent`, `agent-rename`, `agent-archive`,
`agent-adopt`) and host updates (`update-check`, `update-install`, `dsh-update-install`)
stay with the admin — the last three install software on the host. Adjust the split with
the row's `sharedEndpoints` config.

**Models.** Set the OpenRouter key once, as the admin, through `OPENROUTER_API_KEY` (or
Settings → Models). Every user can then pick those models; **none of them can see or change
the key** — it lives in the deployment environment, and Settings and credentials stay
administrator-only. A user who adds a model profile of their own keeps it, and it is still
matched model by model; only the deployment routes are open-ended. Set
`SMALLPE_DEFAULT_PROVIDERS=` empty to go back to per-user profiles only.

Both are covered by tests in `dsh/vendor/dsbot-auth-bridge/test/`, which run against the
patched copy and skip when there is no login installed.

### Classic mode from the sidebar

DS Bot can hand the window back to DSH's classic Agent interface, but only through
Settings → General → Mode → Switch, four clicks deep.
`dsh/scripts/patch-dsbot-classic-switch.mjs` puts a round button beside the account
control at the foot of the sidebar that makes the same call one click away. It runs from
`bin/install.sh`, is idempotent, and refuses to apply if ds-bot rewords the foot.

**Why a patch, having tried not to.** The shell documents a seat for exactly this —
`sidebar.footer.action`, "optional actions beside Settings at the sidebar foot" — and a
plugin registering there was the first attempt. It does not work in bot mode: ds-bot
paints its own left column over the shell's sidebar, and measured at the seat's own
coordinates the stack is `DIV.bt-list` / `DIV.bt-side` / `DIV.bt-leftcol`, the last
opaque at z-index 25, with the seat's occupant laid out underneath at 28×36 and perfectly
invisible. A second attempt injected a sibling of `.bt-account` with a MutationObserver;
that node measured correctly at (42, 805) and still painted nothing, because the subtree
belongs to ds-bot's React tree. ds-bot declares no extension point of its own, so
rendering inside its component is the only way for the button to appear.

Both failures passed DOM assertions while showing the user nothing. **Screenshot anything
you add to this UI** — `getBoundingClientRect()` is not evidence that a control is
visible.

Patching also buys the better behaviour: `actions` is in scope at the patch site, so the
button calls `setSurface("agent")` directly — the same instant switch the settings row
makes, with no page reload and no writing to ds-bot's localStorage behind its back. It
borrows `bt-round`, the class ds-bot gives the other round icon buttons in that foot, so
the chrome matches its neighbours.

### Patches and pnpm: run `patch-dsbot.sh` after every install

All three ds-bot patches live behind `dsh/scripts/patch-dsbot.sh`, and **it must run after
any pnpm install that touches the web profile.** pnpm restores
`node_modules/ds-bot/client.js` from its store whenever it materialises the profile again,
which undoes them.

This failure is quiet and worth recognising, because it cost a release. The Classic mode
button worked locally and was missing from the container, while the build log plainly said

```
[smallpe] ds-bot: Classic mode button added beside the account control.
```

Nothing failed. The Dockerfile runs `install.sh` (which patches) and then
`enable-auth.sh`, whose first line is `dsh plugin --profile web add dsh-ui-auth` — a
56-package pnpm install that rewrote the file afterwards. The proof was in the image's
mtimes:

```
01:49:47  ds-bot/package.json     <- the install.sh install
01:49:47  ds-bot/index.js         <- the install.sh install
01:51:05  ds-bot/client.js        <- rewritten 78 seconds later
01:51:05  .modules.yaml           <- pnpm writes this when an install finishes
```

Only the patched file was rewritten, in the second pnpm finished adding dsh-ui-auth.

**A local install does not reproduce this.** The patch is written through pnpm's hardlink
into the local store, so a later install restores bytes that are already patched; a fresh
container store holds the pristine copy. Reproducing it locally by removing and re-adding
dsh-ui-auth does not work either — the add reports the same `Packages: +56` and the patch
still survives. Checking the built image is the only reliable test:

```console
$ docker build -t smallpe-verify . && docker run --rm --entrypoint sh smallpe-verify -c \
    'grep -c smallpe-classic-mode /app/dsh/home.dist/profiles/web/node_modules/ds-bot/client.js'
1
```

`enable-auth.sh` now calls `patch-dsbot.sh` as its last step for this reason. The same trap
applies to anything else patched into an installed plugin: the dsh-ui-auth patches are safe
only because nothing installs after them.

### A note on language

`dsh-ui-auth` is written in Chinese and translates itself in the browser: a MutationObserver
sweeps its own DOM and substitutes from a 323-entry phrase table. Two consequences:

* **Its console output is never translated** — that sweep is browser-side only. The
  first-run credentials block is Chinese; read `用户名` as username, `密码` as password.
* **One dialog escapes the sweep.** The TOTP reminder shown right after sign-in is appended
  straight to `document.body` without the markers `translateOurDom()` looks for
  (`.dshua, [role=dialog]`), so it stayed Chinese on an English install.
  `dsh/scripts/localize-ui-auth.mjs` rewrites its four strings in the installed plugin, and
  `enable-auth.sh` runs it for you — locally and in the container image alike. It is
  idempotent, and it fails loudly if a future release rewords the prompt rather than
  leaving you a half-translated dialog. **Re-run it after any `dsh plugin add dsh-ui-auth`**,
  which restores the upstream file.

This belongs upstream at [0QwQ0/dsh-ui-auth](https://github.com/0QwQ0/dsh-ui-auth); until it
lands there, the patch is reapplied on each install.

### The sign-in page

`dsh-ui-auth` renders the login, register and register-success pages itself, in the host,
each headed `<div class="brand">DeepSeek Harness</div>`. No branding plugin can reach
them: `dsh-custom-logo` only restyles the in-app sidebar, and `@local/smallpe-brand` taps
`index.html` — the SPA shell, which a signed-out visitor never receives, because the
gateway redirects them to `/auth/login` first.
`dsh/scripts/patch-ui-auth-branding.mjs` puts the configured logo on all three, and
`enable-auth.sh` runs it. **Re-run it after any `dsh plugin add dsh-ui-auth`.**

**The logo is inlined, not linked**, because the gateway treats exactly one prefix as
public — `pathname === '/auth' || pathname.startsWith('/auth/')` — and answers every other
path to an unauthenticated caller with 401, assets included:

```console
$ curl -o /dev/null -w '%{http_code}\n' localhost:3080/custom-logo/logo-wide.png
401
```

So the patch reads `<DSH_HOME>/branding/logo-wide.png` in the host — the same file
dsh-custom-logo serves — and emits it as a `data:` URI, re-reading when its size or mtime
changes. The sign-in page and the sidebar therefore always show the one configured logo,
including one uploaded through dsh-custom-logo's admin panel. With no branding directory
it falls back to a "SmallPE" wordmark. Inlining is safe against the page's own
`translateHtml()`, which substitutes over the whole HTML string: every phrase in its table
is Chinese and base64 is ASCII, so nothing can land inside the payload.

The three tab titles are rewritten in the same pass. They were `登录 · DeepSeek Harness`
and friends, and none of those Chinese words are in the phrase table, so the tab stayed
Chinese even on an English install.

Two upstream names are deliberately left alone, since both are stored with enrolled
credentials rather than merely displayed: the WebAuthn relying-party name (override it
with `DSH_AUTH_RP_NAME`) and the TOTP issuer, which authenticator apps have already
recorded for anyone enrolled.

The `@local/dsbot-auth-bridge` plugin is already installed and opens exactly one route
(`POST /api/bot`) through that gateway, so the DS Bot panels keep working; without it the
gateway rejects DS Bot's own request shape and every panel errors with an empty model list.
With no gateway present the bridge simply sits idle and costs nothing.

To go back to token-only local mode:

```bash
./dsh/node_modules/.bin/dsh plugin --profile web remove dsh-ui-auth
```

Both commands only touch `dsh/home/profiles/web/`, which is gitignored; the profile template
is untouched, so a fresh `./bin/install.sh` still comes up without a login.

To expose it behind a reverse proxy, set the public URL explicitly:

```bash
DSH_PUBLIC_URL=https://smallpe.example.com/ DSH_TRUSTED_HOST=smallpe.example.com ./bin/run.sh
```

Without those variables no external authority is trusted, which is the correct default.

---

## Deploying to Railway

[![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/new/template/tgOYSP?utm_medium=integration&utm_source=button&utm_campaign=smallpe)

The one-click template builds this repository's `Dockerfile` — a finished `./bin/install.sh`:
the harness, its plugins, the document toolchain, Chromium for the browser tools and the nine
provisioned agents, with the login switched on — and sets up everything the service needs:

| Included | Why |
|---|---|
| **Volume at `/data`** | users, logins, the agent roster, conversations, model keys and everything the agents write live here, so they survive every redeploy. Without it, each deploy starts from scratch. |
| **Public domain** (port 8080) | the start script trusts the generated `*.up.railway.app` domain automatically. |
| **Health check** `/auth/login` | the one page that answers 200 before anyone signs in. |

### Step by step

1. **Fill in the form and deploy.** Click **Deploy on Railway** above and sign in to Railway.
   The form asks for two values:
   - `SMALLPE_ADMIN_PASSWORD` — the password for the `admin` account: 8–128 characters with at
     least two of lower-case, upper-case, digits and symbols;
   - `OPENROUTER_API_KEY` — the model key the agents use, from
     [openrouter.ai/keys](https://openrouter.ai/keys).

   Click **Deploy**; the first build takes about five minutes.
2. **Sign in.** Open the service's generated domain (on its card, or **Settings → Networking**)
   and sign in as **`admin`** with the password you typed into that field — its value, not the
   name `SMALLPE_ADMIN_PASSWORD`. The interface is in English. To look either value up later,
   open the service's **Variables** on Railway.
3. **Pick a model.** The Managing Partner asks for one on first use; the three recommended
   OpenRouter models are listed. To change the key later, edit `OPENROUTER_API_KEY` in the
   service's **Variables** (Railway redeploys), or paste another under the gear at the foot of
   the sidebar → **Models and API keys**.
4. **Start working.** The Managing Partner and the eight specialists are already in the sidebar.
   To add teammates, create **Invite codes** under **Settings → User management** (see below for
   where that is) and send them one each.

**Changing the admin password.** Account settings live in the classic interface: click
**Classic mode** (the ⇄ button at the foot of the sidebar, beside the gear), then **Settings**
(bottom left) → **User management** → **Change password**. You can do this at any
time. `SMALLPE_ADMIN_PASSWORD` only replaces the first, one-time password: once the password has
been changed, redeploys leave it alone, and editing the variable later has no effect.

**Without `SMALLPE_ADMIN_PASSWORD`** (an older template, or the manual setup below) the login
plugin creates `admin` with a random one-time password instead and prints it in the deploy log —
**Deployments → View logs**, the `[dsh-ui-auth]` block, labelled in Chinese: `用户名` is the
username and `密码` the password. It is also in `/data/workspace/dsh-ui-auth-bootstrap.txt` until
the password is changed.

Redeploys and updates keep everything on `/data`: users, agents and conversations survive. The
volume can be grown later from the service's **Volume** settings, but not shrunk.

**Updating.** A template deployment is pinned to the commit that was current when you deployed;
it does not follow this repository on its own. To take the latest version, open the service's
**Settings → Source** and connect it to this repository's `main` branch (or apply the update
Railway offers for the template). Railway then rebuilds, and redeploys on every new commit.

**A custom domain** needs the two variables from the section above, for example
`DSH_PUBLIC_URL=https://smallpe.example.com/` and `DSH_TRUSTED_HOST=smallpe.example.com`.

### Without the template

Railway also builds the repository as-is: **New Project → Deploy from GitHub repo → this
repository**. Then set the three things the template would have, once:

| Setting | Value |
|---|---|
| **Volume** | mount path `/data` — without it, users and agents are reset on every deploy, and the log warns about it |
| **Settings → Networking → Generate Domain** | port `8080` |
| **Variables → `SMALLPE_ADMIN_PASSWORD`** *(recommended)* | the password for the first `admin` account |
| **Variables → `OPENROUTER_API_KEY`** *(recommended)* | the model key the agents use |
| **Settings → Healthcheck path** *(optional)* | `/auth/login` |

The same image runs anywhere Docker does:

```bash
docker build -t smallpe .
docker run -p 8080:8080 -v smallpe-data:/data smallpe   # open http://localhost:8080
```

### How the container is put together

* **The login is always on.** A public URL with no login would hand anyone a shell in the
  container. The agents are provisioned *before* `dsh-ui-auth` is enabled, because provisioning
  cannot pass the login gateway.
* **`dsh web` binds loopback only**: `--host` rejects wildcard addresses, and a platform routes
  traffic to `$PORT` on all interfaces. `dsh/scripts/forward-port.mjs` forwards raw TCP from
  `$PORT` to `127.0.0.1:3080`, so headers and WebSockets reach DSH untouched.
* **State lives on the volume.** `bin/container-start.sh` seeds `/data/home` (`$DSH_HOME`) and
  `/data/workspace` (the team workspace) on first boot and links `dsh/home` and
  `agentic-team-for-private-equity/` to them, so every path in [CONTRACT.md](dsh/CONTRACT.md)
  still holds.
* **The profile comes from the image.** Configuration and plugins are refreshed on every deploy,
  so a new image never runs against stale plugins — and a plugin added through the UI does not
  survive a redeploy. Add it to `dsh/templates/profiles/web/package.json` instead.
* **Workspace files a later commit adds** are copied onto the volume on the next boot. Files
  already there are never overwritten, so the agents' edits are kept.

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

**The browser shows only `dsh web authentication required; reopen the URL printed by dsh web.`**
You opened the plain address instead of the token URL. Go back to the terminal and open the
`dsh web: http://…/?token=…` line — the token is new on every start. See
[Which URL to open](#which-url-to-open). To stop dealing with tokens, run
`./dsh/scripts/enable-auth.sh` and sign in instead.

**`./bin/run.sh` starts but nothing appears in the browser, and nothing is printed.**
Almost always an old Node.js. Run `node --version`; you need ≥ 22.19.

**`dsh: warning: 1 entry did not activate` — `dsbot-auth-bridge … waiting for service: uiAuth`.**
Stale build. The bridge waits for `dsh-ui-auth` on an inner fiber precisely so an install
without the login reports nothing; if you still see this, your `dsh/vendor/dsbot-auth-bridge`
predates that change. The warning is harmless either way — the bridge only has work to do
when the gateway is installed.

**No agents in the sidebar.**
Provisioning did not complete. Run `node dsh/scripts/provision-bots.mjs` and read its output.
If it reports that the server did not become ready, start `./bin/run.sh` once in another
terminal and retry — the script reports the server's own log tail on failure.

**The sidebar file viewer cannot open a document: `transport failure for /api/workspaceFiles/readBytes: HTTP 502`.**
Fixed by `dsh/scripts/patch-ui-auth-sharing.mjs`, which `enable-auth.sh` applies. The
gateway buffers every `/api/*` RPC response and re-serialises it to project ownership onto
the result — but DSH answers **`multipart/form-data`** whenever a result carries bytes, and
DSH's own client branches on exactly that content type. The gateway had no such branch, so
`JSON.parse` met the `--boundary` prefix and threw *"No number after minus sign in JSON at
position 1"*, which the catch turned into 502 *"Could not persist or project response"*.

This affected **every user including the admin**, and every endpoint returning bytes — not
just PDFs. Multipart responses are now forwarded untouched: a byte range carries no
ownership fields to filter, and the request was already authorized before being forwarded.
`dsh/scripts/verify-file-reads.mjs` checks the bytes arrive identical to the file on disk.

**SmallPE branding in the DS Bot UI.** `dsh/scripts/patch-dsbot-branding.mjs`, run by
`bin/install.sh`, rewrites the bundled UI so a SmallPE install does not say "DS Bot":
the settings nav ("About DS Bot" → "About SmallPE"), the Recent-errors source labels,
the update banners, and the Feedback page, whose "Report on GitHub" button pointed at the
upstream repository and now reads "Send to SmallPE" and opens <https://www.SmallPE.com>.

Text and that one destination only — no element is removed and no handler changes. It
deliberately leaves alone the **GitHub connector** strings (`GitHub token`, `Create a
token on GitHub`, …), which describe a real integration rather than upstream branding,
and runtime text such as `update to ds-bot@0.3.1 failed`, which names the npm package
actually being updated. Verified against the 1.6 MB bundle the browser is served: zero
occurrences of "DS Bot".

> Because feedback now opens www.SmallPE.com instead of a GitHub issue form, the
> prefilled diagnostics are no longer consumed by anything. Put a form at that URL if you
> want the reports to land somewhere.

**Upgrading ds-bot.** Two things must be re-derived on every bump, because both fail
quietly rather than loudly:

* **The `/api/bot` endpoint allow-list** in `dsh/vendor/dsbot-auth-bridge/index.js`.
  DS Bot names its operation in the request body, so the bridge decides per endpoint —
  and anything unclassified falls through to admin-only, which looks to a non-admin like
  a feature that does nothing. 0.2.0 served 11 endpoints; 0.3.1 serves 22. A test in
  `dsh/vendor/dsbot-auth-bridge/test/policy.test.mjs` greps the installed client and
  fails if any endpoint is unclassified, so the next bump surfaces this immediately.
* **`dsh/scripts/patch-dsbot-typing.mjs`.** ds-bot 0.3.1 ships the descendant selector
  upstream, so the script now reports "nothing to patch" and exits 0. It is kept for
  older pins and because the explicit check tells you which case you are in.

**An agent shows no "thinking" feedback — nothing happens until the whole reply appears.**
A DOM-contract skew between `ds-bot@0.2.0` and DSH `0.2.1-rc.2`, fixed by
`dsh/scripts/patch-dsbot-typing.mjs`, which `./bin/install.sh` runs for you. ds-bot finds
the indicator's portal container with `[data-chat-flow] > [data-chat-running]`, a
direct-child selector; this DSH wraps slot contributions, so the element is a grandchild
(`[data-chat-flow] > [data-slot] > [data-chat-running]`) and the query never matches —
`useRunningHost` returns null and the component renders nothing. Everything else about it
already works: measured live 250ms into a turn, `running` is true, nothing is streaming,
the entrance phase is `in` and the label is picked. Only the container is missing.
**Re-run that script after any `pnpm install` in the profile**, which restores the npm copy.

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
