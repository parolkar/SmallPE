# SmallPE Agent Team

AI-first private equity team: 1 Managing Partner orchestrating 7 specialist agents via Claude Code.

## Quick Start

### Option A: Claude Code (local, no Docker)

```bash
cd agentic-team-for-private-equity
claude
```

That's it. Claude Code loads `CLAUDE.md` and you're talking to the Managing Partner.

### Option B: Nanoclaw (containerised, with messaging)

Nanoclaw runs the Managing Partner in a Docker container and connects it to Telegram, WhatsApp, Discord, etc.

**1. Install Nanoclaw** (one-time):
```bash
git clone https://github.com/nanocoai/nanoclaw.git nanoclaw-v2
cd nanoclaw-v2
bash nanoclaw.sh
```
Follow the prompts -- it installs Node, pnpm, Docker if missing, and pairs your first messaging channel.

**2. Copy this folder into Nanoclaw as an agent group:**
```bash
cp -r /path/to/agentic-team-for-private-equity nanoclaw-v2/groups/smallpe
```

**3. Add a messaging channel** (e.g. Telegram):
```bash
cd nanoclaw-v2
claude
# then inside Claude Code:
/add-telegram
```

**4. Message your agent** from Telegram (or whichever channel you paired). The Managing Partner boots from `CLAUDE.md`, reads `soul.md` for its identity, and dispatches specialist agents as needed.

### Prerequisites (both options)

- [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) + Anthropic API key
- `uvx` (for mcp-pandoc) -- `pip install uv` or `pipx install uv`
- XeLaTeX (for PDF reports) -- `brew install mactex` or `apt install texlive-xetex`
- Docker (Nanoclaw option only)

## What You Can Ask

```
Develop an investment thesis for [sector]        # dispatches Oracle + Iris
Source deals matching our thesis                  # dispatches Helios
Run due diligence on [company]                    # dispatches Athena (who runs Prometheus + Themis)
Build a financial model for [deal]                # dispatches Logos
Prepare closing materials                         # dispatches Hermes
```

## Architecture

```
Managing Partner (CLAUDE.md + soul.md)
  |-- Oracle        thesis development
  |-- Helios        deal sourcing
  |-- Athena        due diligence orchestration
  |     |-- Prometheus   business evaluation
  |     |-- Themis       evidence verification
  |-- Logos         financial modeling
  |-- Hermes        deal closing
  |-- Iris          impact investing (cross-cutting)
```

Pipeline: `Oracle --> Helios --> Athena --> Logos --> Hermes` (sequential). Iris engages at every stage.

## Key Files

| File | Purpose |
|------|---------|
| `CLAUDE.md` | Managing Partner boot file (entry point) |
| `soul.md` | Identity, values, operating principles |
| `AGENTS.md` | Team roster and dispatch rules |
| `agents/shared-tools.md` | Tool instructions (pdf2md, excel2md, pandoc) |
| `agents/*/CLAUDE.md` | Individual agent personas |
| `memory/` | Journals and deal capsules (persistent) |
| `smallpe-agent-swarm.yml` | Legacy Claude Swarm config (archived) |
