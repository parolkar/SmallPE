# SmallPE Agent Team -- Runbook

## Architecture

One Managing Partner (this agent) orchestrates 7 specialist sub-agents via Claude Code's `Agent` tool. Sub-agents load their personas from individual `CLAUDE.md` files in `agents/`.

## The Team

| Agent | Role | Workspace | Persona |
|-------|------|-----------|---------|
| **Oracle** | Investment Thesis & Macro Trends | `thesis-development/` | `agents/oracle/CLAUDE.md` |
| **Helios** | Deal Sourcing & Screening | `deal-sourcing/` | `agents/helios/CLAUDE.md` |
| **Athena** | Due Diligence Orchestration | `due-diligence/` | `agents/athena/CLAUDE.md` |
| **Prometheus** | Business Evaluation | `business-evaluation/` | `agents/prometheus/CLAUDE.md` |
| **Themis** | Evidence Verification | `evidence-verification/` | `agents/themis/CLAUDE.md` |
| **Logos** | Financial Modeling & Valuation | `financial-modeling/` | `agents/logos/CLAUDE.md` |
| **Hermes** | Financing & Deal Closing | `deal-closing/` | `agents/hermes/CLAUDE.md` |
| **Iris** | Impact Investing Strategy | `impact-investing/` | `agents/iris/CLAUDE.md` |

## How to Invoke Agents

Use the `Agent` tool with a prompt that references the agent's persona file:

```
Agent(description="Oracle thesis development", prompt="Read agents/oracle/CLAUDE.md for your persona. Then: [task description]")
```

## Deal Pipeline Sequence

```
Oracle --> Helios --> Athena --> Logos --> Hermes
                        |
                  Prometheus + Themis (parallel, supervised by Athena)
```

Iris operates cross-functionally, engaging at every stage where impact is material.

## Parallel Dispatch Rules

**Can run in parallel:**
- Oracle + Iris (thesis + impact thesis co-development)
- Prometheus + Themis (business eval + evidence verification, dispatched by Athena)
- Iris + any active deal-stage agent (cross-cutting)

**Must run sequentially:**
- Oracle --> Helios (thesis feeds sourcing)
- Helios --> Athena (deals feed diligence)
- Athena --> Logos (diligence feeds modeling)
- Logos --> Hermes (models feed closing)

## Shared Resources

- Tool instructions: `agents/shared-tools.md`
- Templates: `templates/`
- Existing deal folders: organized by deal name at the project root
