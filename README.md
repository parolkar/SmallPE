# SmallPE Model - A Model of AI-First Private Equity Firm 

This is @parolkar's new ambiitious project to create a model Private Equity investment done in the AI-first way.

## Demo Video

[Watch the SmallPE Demo Video](https://smallpe.com/#demo)

## Requirements

- Ruby 3.3.4

## Setup

1. Install 

2. Install Bundler:
   ```bash
   gem install bundler
   ```

3. Install project dependencies:
   ```bash
   bundle  install
   ```

## Quick Start

### Option A — DeepSeek Harness (recommended, no Ruby needed)

Run the whole agent team as a local web workspace. Requires only **Node.js ≥ 22.19**.

```bash
./bin/install.sh    # one time: installs the harness and the 9 agents
./bin/run.sh        # start it
```

**Open the `dsh web:` URL that `run.sh` prints**, not a bare `127.0.0.1:3080`:

```
dsh web: http://127.0.0.1:3080/?token=hRyX5u9fDpN9e26wkL_WlGfsOJuNj0UShtB-iTLw8LY
```

The harness mints a new launch token on every start, and only that URL exchanges it for a
browser cookie. Opening the plain address first gets you one line of text —
`dsh web authentication required; reopen the URL printed by dsh web.` — which looks like a
broken install but is only a missing token. Once you have used the token URL once, the plain
address works until the cookie expires.

> Want a real username/password login instead of the per-start token? Run
> **`./dsh/scripts/enable-auth.sh`** once before `./bin/run.sh` — then you open the plain
> `http://127.0.0.1:3080` and sign in. It is optional for local use and recommended before
> exposing the UI to anyone else. See
> [Optional: put a login in front of it](DSH-README.md#optional-put-a-login-in-front-of-it).

Everything installs inside this folder — the harness, its packages, the agents and their
conversations. Delete the folder and it is all gone. The Managing Partner and all eight
specialist agents are created for you on first install, each working in its own folder.

See **[DSH-README.md](DSH-README.md)** for setup details, adding your model key, enabling a
login before exposing it publicly, and troubleshooting.

### Option B — one-click deploy on Railway (for a team)

[![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/new/template/Us9ZyG?utm_medium=integration&utm_source=button&utm_campaign=smallpe)

The same harness, hosted, with a login in front. The template already includes the persistent
volume, the public domain and the health check:

1. Click **Deploy on Railway**, type the **admin password** you want into
   `SMALLPE_ADMIN_PASSWORD` (8+ characters, mixing letters with digits or symbols), and click
   **Deploy**. The first build takes about five minutes.
2. Open the generated `*.up.railway.app` address and sign in as **`admin`** with the password you
   typed into that field — its value, not the name `SMALLPE_ADMIN_PASSWORD`.
3. Add your model key: the gear at the foot of the sidebar → **Models and API keys**, or set
   `OPENROUTER_API_KEY` in the service's **Variables** on Railway.

Change the password any time: switch to **Classic mode** (the ⇄ button at the foot of the sidebar), then
**Settings → User management → Change password**.

Step-by-step guide, custom domains and the manual setup:
**[Deploying to Railway](DSH-README.md#deploying-to-railway)**.

### Option C — the Replit template or Grok Bot

The easiest way to start using the Agentic Team is via the Replit Template:
[SmallPE Replit Template](https://replit.com/@inloop/SmallPE-replit?v=1#README.md)

Or add the [SmallPE Grok Bot](https://x.ai/bot/Opp17hS9gyOg8xEsQIcU8) to get started in seconds.

## Development

### For the public-facing content and website
The content is managed via nanoc To start the development server:

```bash
bundle exec nanoc view
```

or

```bash
bundle exec nanoc live
```

This will start a local server and automatically rebuild the site when files change.

#### Building for Production

To build the static site:

```bash
bundle exec nanoc 
```

The generated files will be in the 'output' directory (this is the one that is deployed for the website).

### For testing and launching agents


#### Start the agent swarm 

```bash
% ./bin/start_agentic_team
```

