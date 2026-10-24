#!/usr/bin/env bash
#
# SmallPE — one-time installer for the local DeepSeek Harness setup.
#
# Installs everything INSIDE this repository and nowhere else:
#   ./dsh/node_modules   the DSH runtime + pnpm (pinned)
#   ./dsh/.pnpm-store    the pnpm content-addressable store
#   ./dsh/home           $DSH_HOME: profiles, branding, agents, sessions, memory
#
# Nothing is installed globally and nothing is written to $HOME (see README
# "What is NOT folder-local" for the few third-party exceptions).
#
# Safe to re-run. Existing state, credentials and agent conversations are never
# overwritten. Use --refresh-config to also re-copy the shipped configuration
# templates over the ones under ./dsh/home.
#
# Usage:  ./install.sh [--refresh-config] [--skip-provision]

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DSH_DIR="$ROOT/dsh"
TEMPLATES="$DSH_DIR/templates"

# The harness home is ALWAYS inside this repository, and is never inherited.
#
# This is a real hazard, not a theoretical one. Launch this installer from inside
# another DSH session and that session exports DSH_HOME pointing at your personal
# ~/.dsh; honouring the inherited value would install SmallPE's profile into, and
# try to provision SmallPE's agents into, somebody else's harness home. So we set
# it unconditionally. Set SMALLPE_DSH_HOME only to deliberately relocate it.
DSH_HOME_ORIGINAL="${DSH_HOME:-}"
export DSH_HOME="${SMALLPE_DSH_HOME:-$DSH_DIR/home}"
export DSH_AGENTS_HOME="$DSH_HOME/agents"
export SMALLPE_TEAM_WORKSPACE="$ROOT/agentic-team-for-private-equity"
export PATH="$DSH_DIR/node_modules/.bin:$PATH"
export CHROME_DEVTOOLS_MCP_NO_UPDATE_CHECKS=1

# Clear the ambient session identity so nothing here attaches to the caller's
# harness session or profile.
unset DSH_PROFILE DSH_PROFILE_DIR DSH_SESSION_ID DSH_WEB_URL DSH_SHELL

REFRESH_CONFIG=0
SKIP_PROVISION=0
for arg in "$@"; do
  case "$arg" in
    --refresh-config) REFRESH_CONFIG=1 ;;
    --skip-provision) SKIP_PROVISION=1 ;;
    -h|--help)
      sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'
      exit 0 ;;
    *) echo "SmallPE: unknown option '$arg'" >&2; exit 2 ;;
  esac
done

say()  { printf '\033[1;36m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[!]\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[1;31m[x]\033[0m %s\n' "$*" >&2; exit 1; }

# ----------------------------------------------------------------------------- #
say "SmallPE · DeepSeek Harness installer"
echo "    repository : $ROOT"
echo "    harness    : $DSH_HOME"
echo

# --- 0. containment ---------------------------------------------------------- #
# Refuse to run unless the harness home really is inside this repository. This is
# the guard that stops a stray DSH_HOME (for example the one every nested DSH
# session exports) from pointing the installer at a stranger's harness home, where
# it would copy configuration and provision agents into their live team.
case "$DSH_HOME/" in
  "$ROOT"/*) : ;;
  *) die "refusing to install: the harness home is outside this repository.
       harness home: $DSH_HOME
       repository  : $ROOT
       Unset DSH_HOME, or unset SMALLPE_DSH_HOME, and run ./install.sh again." ;;
esac
if [ -n "${DSH_HOME_ORIGINAL:-}" ] && [ "$DSH_HOME_ORIGINAL" != "$DSH_HOME" ]; then
  warn "ignored an inherited DSH_HOME ($DSH_HOME_ORIGINAL); using $DSH_HOME"
fi

# --- 1. host prerequisite: Node.js ------------------------------------------- #
# `import.meta.main` (DSH's entry guard) only exists from Node 22.18/24.2, and
# below that the CLI exits 0 without doing anything. Require 22.19+ for the
# bundled office/PDF tooling too.
command -v node >/dev/null 2>&1 || die "Node.js is required but was not found on PATH. Install Node.js 22.19 or newer."
node -e '
  const [major, minor] = process.versions.node.split(".").map(Number);
  if (!(major > 22 || (major === 22 && minor >= 19))) {
    console.error(`SmallPE: Node.js >= 22.19 is required (found ${process.version}).`);
    process.exit(1);
  }
' || die "unsupported Node.js version."
say "Node.js $(node --version) OK"
command -v npm >/dev/null 2>&1 || die "npm is required but was not found on PATH (it ships with Node.js)."

# --- 2. the local DSH runtime + pnpm ----------------------------------------- #
# `npm install` (not npx) is what keeps this folder-local: npx would unpack the
# harness into a hash-named cache under $HOME, with no lockfile to pin.
if [ -f "$DSH_DIR/package-lock.json" ]; then
  say "Installing the pinned DSH runtime (npm ci) — this is ~900 MB the first time"
  ( cd "$DSH_DIR" && npm ci --no-fund --no-audit )
else
  say "Installing the pinned DSH runtime (npm install) — this is ~900 MB the first time"
  ( cd "$DSH_DIR" && npm install --no-fund --no-audit )
fi
[ -x "$DSH_DIR/node_modules/.bin/dsh" ] || die "the DSH runtime did not install correctly ($DSH_DIR/node_modules/.bin/dsh is missing)."
say "DSH $( "$DSH_DIR/node_modules/.bin/dsh" --version ) installed locally"
[ -x "$DSH_DIR/node_modules/.bin/pnpm" ] || warn "a local pnpm was not installed; profile plugins may need a global pnpm."

# --- 3. the harness home, seeded from templates ------------------------------ #
say "Creating the harness home"
mkdir -p "$DSH_HOME/profiles/web" "$DSH_HOME/branding" "$DSH_HOME/bot" \
         "$DSH_HOME/sessions" "$DSH_HOME/storages" "$DSH_HOME/logs" "$DSH_DIR/.pnpm-store"

# copy_template <source> <destination> — shipped configuration and branding.
# Left alone unless --refresh-config is given; when refreshing, the previous file is
# kept alongside as <name>.bak so a local edit is never lost silently.
copy_template() {
  local src="$1" dst="$2"
  [ -e "$src" ] || die "missing shipped template: $src"
  if [ -e "$dst" ]; then
    [ "$REFRESH_CONFIG" -ne 1 ] && return 0
    if ! cmp -s "$src" "$dst"; then
      cp -R "$dst" "$dst.bak"
      warn "updated $(basename "$dst") — previous version kept at $(basename "$dst").bak"
    fi
  fi
  mkdir -p "$(dirname "$dst")"
  cp -R "$src" "$dst"
}

# Configuration (safe to refresh; contains no user data).
copy_template "$TEMPLATES/profiles/web/package.json"        "$DSH_HOME/profiles/web/package.json"
copy_template "$TEMPLATES/profiles/web/pnpm-workspace.yaml" "$DSH_HOME/profiles/web/pnpm-workspace.yaml"
copy_template "$TEMPLATES/profiles/web/cordis.yml"          "$DSH_HOME/profiles/web/cordis.yml"
copy_template "$TEMPLATES/profiles/web/cordis.patch.yml"    "$DSH_HOME/profiles/web/cordis.patch.yml"
if [ -f "$TEMPLATES/profiles/web/pnpm-lock.yaml" ]; then
  copy_template "$TEMPLATES/profiles/web/pnpm-lock.yaml"    "$DSH_HOME/profiles/web/pnpm-lock.yaml"
fi

# Branding: dsh-custom-logo serves these exact filenames from $DSH_HOME/branding.
for logo in logo-64.png logo-128.png logo-wide.png; do
  copy_template "$TEMPLATES/branding/$logo" "$DSH_HOME/branding/$logo"
done

# User state. NEVER overwritten, not even by --refresh-config: this is the live roster,
# the agent conversations and the user's credentials, and clobbering state.json would
# silently destroy the team and force a full re-provision with new session ids.
seed_if_missing() {
  local src="$1" dst="$2"
  [ -e "$src" ] || die "missing shipped template: $src"
  [ -e "$dst" ] && return 0
  mkdir -p "$(dirname "$dst")"
  cp -R "$src" "$dst"
}
seed_if_missing "$TEMPLATES/state.seed.json"           "$DSH_HOME/bot/state.json"
seed_if_missing "$TEMPLATES/secrets.template.json"     "$DSH_HOME/bot/secrets.json"
seed_if_missing "$TEMPLATES/credentials.template.yaml" "$DSH_HOME/.credentials.yaml"
chmod 600 "$DSH_HOME/.credentials.yaml" "$DSH_HOME/bot/secrets.json" 2>/dev/null || true

# --- 4. profile plugins ------------------------------------------------------ #
# The CLI resolves pnpm from PATH; step 2 put the folder-local pnpm first. The
# profile's pnpm-workspace.yaml pins `storeDir` inside the repo, which is the only
# mechanism pnpm 12 honours for keeping its content-addressable store local.
say "Installing profile plugins (pnpm) — this is ~350 MB the first time"
if [ -x "$DSH_DIR/node_modules/.bin/dsh" ]; then
  ( cd "$ROOT" && "$DSH_DIR/node_modules/.bin/dsh" plugin --profile web install ) \
    || die "installing the profile plugins failed. Re-run ./install.sh; if it persists, run 'cd \"$DSH_HOME/profiles/web\" && \"$DSH_DIR/node_modules/.bin/pnpm\" install' to see the raw error."
else
  die "the DSH CLI is not available; cannot install profile plugins."
fi

# --- 5. the agents' working folders ------------------------------------------ #
say "Preparing the SmallPE agent workspaces"
# Each agent works in its own folder inside the repo. The folder must exist before
# DS Bot accepts it as a working directory, so create them from the seed.
node -e '
  const { readFileSync, mkdirSync } = require("node:fs");
  const { resolve } = require("node:path");
  const root = process.argv[1];
  const seed = JSON.parse(readFileSync(process.argv[2], "utf8"));
  const dirs = new Set();
  for (const bot of seed.bots ?? []) if (bot.workspace) dirs.add(bot.workspace);
  for (const rel of dirs) {
    const dir = resolve(root, rel);
    if (!dir.startsWith(root)) throw new Error(`workspace escapes the repository: ${rel}`);
    mkdirSync(dir, { recursive: true });
  }
  console.log(`    ${dirs.size} agent workspace folders ready`);
' "$ROOT" "$TEMPLATES/bots.seed.json"

# --- 6. the SmallPE agent roster --------------------------------------------- #
if [ "$SKIP_PROVISION" -eq 1 ]; then
  warn "skipping agent provisioning (--skip-provision); run 'node dsh/scripts/provision-bots.mjs' later."
else
  say "Provisioning the SmallPE agent team into DS Bot"
  ( cd "$ROOT" && node "$DSH_DIR/scripts/provision-bots.mjs" ) \
    || warn "agent provisioning did not complete. The harness still works; re-run ./install.sh to retry, or run 'node dsh/scripts/provision-bots.mjs'."
fi

# --- 7. done ----------------------------------------------------------------- #
echo
say "Done."
cat <<EOF

  Start SmallPE:      ./run.sh
  Then open:          http://127.0.0.1:${DSH_PORT:-3080}

  Add your model key: open the Web UI -> Settings -> Models, or export the variable
                      named by your provider before running ./run.sh.

  Remove everything:  delete this folder. Nothing was installed outside it.

EOF
