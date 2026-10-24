#!/usr/bin/env bash
#
# SmallPE — launch the DeepSeek Harness web UI.
#
# Everything this script touches lives inside this repository:
#   * the DSH runtime        -> ./dsh/node_modules
#   * all harness user data  -> ./dsh/home            ($DSH_HOME)
#   * the pnpm store         -> ./dsh/.pnpm-store
#   * the agents' workspaces -> ./agentic-team-for-private-equity
#
# The only thing it needs from the host is a Node.js >= 22.19 install.
# Delete this folder and the whole SmallPE harness is gone.
#
# Optional environment variables:
#   DSH_PORT=3080                 port to listen on
#   DSH_HOST=127.0.0.1            bind address
#   DSH_PUBLIC_URL=https://...    set when serving behind a reverse proxy
#   DSH_TRUSTED_HOST=example.com  set (can repeat, comma-separated) with DSH_PUBLIC_URL
#   DSH_OPEN_BROWSER=1            open a browser window on start
#   SMALLPE_DSH_HOME=...          override the harness home (defaults to ./dsh/home)
#   SMALLPE_LOCAL_BASE_URL=...    OpenAI-compatible local model server
#                                 (default http://127.0.0.1:1234/v1)
#   SMALLPE_LOCAL_API_KEY=...     key for the local server; defaults to a
#                                 placeholder because the client always sends one
#   OPENROUTER_API_KEY=...        no default — get one at https://openrouter.ai/keys

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DSH_DIR="$ROOT/dsh"

# The harness home is ALWAYS inside this repository, and is never inherited.
#
# This matters more than it looks: if you run this script from inside another DSH
# session (a model's shell tool, for instance), that session exports DSH_HOME
# pointing at your personal ~/.dsh. Honouring an inherited value would silently
# start SmallPE against somebody else's harness home — its profile, its agents,
# its credentials. So we set it unconditionally and ignore any ambient value.
# Set SMALLPE_DSH_HOME only if you deliberately want to relocate the home.
export DSH_HOME="${SMALLPE_DSH_HOME:-$DSH_DIR/home}"
export DSH_AGENTS_HOME="$DSH_HOME/agents"
export SMALLPE_TEAM_WORKSPACE="$ROOT/agentic-team-for-private-equity"

# Two providers are configured by default: "local" and "OpenRouter" (see the
# profile's cordis.patch.yml). Both need an apiKeyEnv to exist so the harness
# treats the route as configured.
#
#   * The local route talks to an OpenAI-compatible server on this machine,
#     which normally ignores the key — but OpenAI-compatible clients insist on
#     sending one, so default it to a harmless placeholder. Point the server
#     anywhere with SMALLPE_LOCAL_BASE_URL (default http://127.0.0.1:1234/v1).
#   * OpenRouter deliberately has NO default: export OPENROUTER_API_KEY, or add
#     the key in Settings -> Models. Without it, that provider simply cannot
#     authenticate.
: "${SMALLPE_LOCAL_API_KEY:=local}"
export SMALLPE_LOCAL_API_KEY
: "${SMALLPE_LOCAL_BASE_URL:=http://127.0.0.1:1234/v1}"
export SMALLPE_LOCAL_BASE_URL

# Clear the ambient session identity, so the child harness is a fresh independent
# process rather than a continuation of whatever launched this script.
unset DSH_PROFILE DSH_PROFILE_DIR DSH_SESSION_ID DSH_WEB_URL DSH_SHELL

# Keep plugin-relative writes inside the repository...
cd "$SMALLPE_TEAM_WORKSPACE"

# ...and make the SmallPE team folder the harness WORKSPACE.
#
# DSH treats the invoking directory as the default workspace root: it registers that
# folder as a workspace and runs sessions there. Starting in
# agentic-team-for-private-equity/ therefore puts the whole team — the user's own
# sessions and every agent's — in the one folder that holds the agent definitions,
# workflows, templates and memory. That folder is the source of truth, so it is also
# the single place the collaborative work happens.
#
# (Any file a plugin writes next to the working directory, such as the optional
# dsh-ui-auth session/audit files, therefore lands in the team folder too. They are
# matched by .gitignore and never committed.)

# --- host prerequisite: Node.js -------------------------------------------------
# DSH's entry point is `if (import.meta.main) await runCli()`, and `import.meta.main`
# only exists from Node 22.18.0 / 24.2.0. Below that the CLI exits 0 having done
# nothing at all, which is the single most confusing way for this to fail.
if ! command -v node >/dev/null 2>&1; then
  echo "SmallPE: Node.js is required but was not found on PATH." >&2
  echo "         Install Node.js 22.19 or newer, then try again." >&2
  exit 1
fi
node -e '
  const [major, minor] = process.versions.node.split(".").map(Number);
  const ok = major > 22 || (major === 22 && minor >= 19);
  if (!ok) {
    console.error(`SmallPE: Node.js >= 22.19 is required (found ${process.version}).`);
    console.error("         Older versions silently do nothing when DSH starts.");
    process.exit(1);
  }
'

if [ ! -x "$DSH_DIR/node_modules/.bin/dsh" ]; then
  echo "SmallPE: the local harness is not installed yet." >&2
  echo "         Run ./bin/install.sh first." >&2
  exit 1
fi

# A folder-local pnpm must win over any globally installed one: the `dsh plugin`
# CLI resolves pnpm from PATH, and a global pnpm would use its own store under \$HOME.
export PATH="$DSH_DIR/node_modules/.bin:$PATH"

# Keep chrome-devtools-mcp's update check from writing a cache file under \$HOME.
export CHROME_DEVTOOLS_MCP_NO_UPDATE_CHECKS=1

ARGS=(--profile web --host "${DSH_HOST:-127.0.0.1}" --port "${DSH_PORT:-3080}")

# A reverse-proxy deployment is strictly opt-in. Without these the UI is loopback-only
# and no external authority is trusted, which is the right default for a local install.
if [ -n "${DSH_PUBLIC_URL:-}" ]; then
  ARGS+=(--public-url "$DSH_PUBLIC_URL")
fi
if [ -n "${DSH_TRUSTED_HOST:-}" ]; then
  IFS=',' read -r -a _hosts <<< "${DSH_TRUSTED_HOST}"
  for _host in "${_hosts[@]}"; do
    [ -n "$_host" ] && ARGS+=(--trusted-host "$_host")
  done
fi

if [ "${DSH_OPEN_BROWSER:-0}" != "1" ]; then
  ARGS+=(--no-open)
fi

echo "SmallPE  ·  DeepSeek Harness"
echo "  workspace : $SMALLPE_TEAM_WORKSPACE"
echo "  harness   : $DSH_HOME"
echo "  open      : http://${DSH_HOST:-127.0.0.1}:${DSH_PORT:-3080}"
echo

exec "$DSH_DIR/node_modules/.bin/dsh" "${ARGS[@]}"
