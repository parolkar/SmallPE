# SmallPE Agent Team

AI-first private equity team: 1 Managing Partner orchestrating 7 specialist agents via Claude Code.

## Quick Start

### Prerequisites

- [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code)
- `uvx` (for mcp-pandoc) -- install via `pip install uvx` or `pipx install uv`
- XeLaTeX (for PDF generation) -- `brew install mactex` or `apt install texlive-xetex`

### Run

```bash
cd agentic-team-for-private-equity
claude
```

Claude Code automatically loads `CLAUDE.md` and you're talking to the Managing Partner. Ask it to:

```
Develop an investment thesis for [sector]        # dispatches Oracle + Iris
Source deals matching our thesis                  # dispatches Helios
Run due diligence on [company]                    # dispatches Athena (who runs Prometheus + Themis)
Build a financial model for [deal]                # dispatches Logos
Prepare closing materials                         # dispatches Hermes
```

### Run via Nanoclaw (Docker + messaging)

```bash
nanoclaw start --config nanoclaw.yml
```

Configure Telegram with `/add-telegram` inside Nanoclaw.

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
