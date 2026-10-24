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
./install.sh    # one time: installs the harness, SmallPE branding and the 9 agents
./run.sh        # start it, then open http://127.0.0.1:3080
```

Everything installs inside this folder — the harness, its packages, the agents and their
conversations. Delete the folder and it is all gone. The Managing Partner and all eight
specialist agents are created for you on first install, each working in its own folder.

See **[DSH-README.md](DSH-README.md)** for setup details, adding your model key, enabling a
login before exposing it publicly, and troubleshooting.

### Option B — the Replit template or Grok Bot

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

