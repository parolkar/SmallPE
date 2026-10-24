#!/usr/bin/env bash
#
# SmallPE — verify an installed harness.
#
# Checks the things that actually break: Node version, folder-local installation,
# branding, profile plugins, the provisioned agent roster, and that no secret or
# personal identity is present in the repository's tracked files.
#
# Usage:  ./dsh/scripts/verify-install.sh

set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DSH_DIR="$ROOT/dsh"
# Never inherit DSH_HOME: a nested DSH session exports its own, and reading that
# would verify somebody else's harness home instead of this repository's.
DSH_HOME="${SMALLPE_DSH_HOME:-$DSH_DIR/home}"
STATE="$DSH_HOME/bot/state.json"
TEMPLATES="$DSH_DIR/templates"

pass=0; fail=0; warn=0
ok()   { printf '  \033[32mPASS\033[0m %s\n' "$*"; pass=$((pass+1)); }
bad()  { printf '  \033[31mFAIL\033[0m %s\n' "$*"; fail=$((fail+1)); }
meh()  { printf '  \033[33mWARN\033[0m %s\n' "$*"; warn=$((warn+1)); }
head_() { printf '\n\033[1m%s\033[0m\n' "$*"; }

head_ "Host"
if command -v node >/dev/null 2>&1; then
  ok "node $(node --version)"
  node -e 'const [a,b]=process.versions.node.split(".").map(Number);
    process.exit(a>22||(a===22&&b>=19)?0:1)' \
    && ok "node >= 22.19" \
    || bad "node is older than 22.19 — DSH will silently do nothing"
else
  bad "node not found on PATH"
fi

head_ "Folder-local installation"
[ -x "$DSH_DIR/node_modules/.bin/dsh" ] && ok "local DSH runtime: dsh/node_modules/.bin/dsh" \
  || bad "local DSH runtime missing — run ./install.sh"
[ -x "$DSH_DIR/node_modules/.bin/pnpm" ] && ok "local pnpm present" \
  || meh "local pnpm missing; profile plugin installs may need a global pnpm"
case "$DSH_HOME" in
  "$ROOT"/*) ok "DSH_HOME is inside the repository ($DSH_HOME)" ;;
  *) bad "DSH_HOME is outside the repository: $DSH_HOME" ;;
esac
[ -d "$DSH_HOME/profiles/web/node_modules" ] && ok "profile plugins installed" \
  || bad "profile plugins missing (dsh/home/profiles/web/node_modules)"
if [ -d "$DSH_DIR/.pnpm-store" ]; then ok "pnpm store is local (dsh/.pnpm-store)"; else meh "local pnpm store not created yet"; fi

head_ "Branding"
for logo in logo-64.png logo-128.png logo-wide.png; do
  if [ -f "$DSH_HOME/branding/$logo" ]; then ok "$logo present"; else bad "$logo missing from dsh/home/branding"; fi
done
if [ -f "$DSH_HOME/branding/logo-64.png" ] && [ -f "$DSH_HOME/branding/logo-128.png" ]; then
  cmp -s "$DSH_HOME/branding/logo-64.png" "$DSH_HOME/branding/logo-128.png" \
    && ok "logo-64.png and logo-128.png are byte-identical" \
    || meh "logo-64.png and logo-128.png differ (dsh-custom-logo writes both from one upload)"
fi
for pkg in smallpe-brand dsbot-auth-bridge dsh-browser-use-chromium; do
  [ -f "$DSH_DIR/vendor/$pkg/package.json" ] && ok "vendor/$pkg present" || bad "vendor/$pkg missing"
done

head_ "Agent roster"
if [ ! -f "$STATE" ]; then
  bad "no roster yet ($STATE) — run ./install.sh or node dsh/scripts/provision-bots.mjs"
else
  node - "$STATE" "$TEMPLATES/bots.seed.json" <<'JS'
const { readFileSync } = require('node:fs')
const [statePath, seedPath] = process.argv.slice(2)
const state = JSON.parse(readFileSync(statePath, 'utf8'))
const seed = JSON.parse(readFileSync(seedPath, 'utf8'))
const byName = new Map(Object.values(state.bots ?? {}).map(b => [b.name, b]))
let ok = 0, bad = 0
for (const want of seed.bots) {
  const found = byName.get(want.name)
  if (found) { console.log(`  \x1b[32mPASS\x1b[0m agent "${want.name}" (${found.role || 'no role'})`); ok++ }
  else { console.log(`  \x1b[31mFAIL\x1b[0m agent "${want.name}" is missing`); bad++ }
}
const mainName = seed.bots.find(b => b.main)?.name
const mainBot = mainName ? byName.get(mainName) : undefined
const isMain = mainBot && (state.mainBotIds ?? []).includes(mainBot.id)
console.log(isMain
  ? `  \x1b[32mPASS\x1b[0m "${mainName}" is the Main Bot`
  : `  \x1b[31mFAIL\x1b[0m "${mainName}" is not the Main Bot (mainBotIds: ${JSON.stringify(state.mainBotIds ?? [])})`)
if (!isMain) bad++
const strays = Object.values(state.bots ?? {}).filter(b => !seed.bots.some(s => s.name === b.name))
if (strays.length === 0) console.log('  \x1b[32mPASS\x1b[0m no stray placeholder agents')
else { console.log(`  \x1b[33mWARN\x1b[0m unexpected agents present: ${strays.map(b => b.name).join(', ')}`); }
process.exitCode = bad ? 1 : 0
JS
  [ $? -eq 0 ] && pass=$((pass+1)) || fail=$((fail+1))
fi

head_ "Sessions for every agent"
if [ -f "$STATE" ]; then
  missing=$(node -e '
    const { readFileSync } = require("node:fs")
    const state = JSON.parse(readFileSync(process.argv[1], "utf8"))
    console.log(Object.values(state.bots ?? {}).map(b => b.id).join("\n"))
  ' "$STATE" | while read -r id; do
    [ -z "$id" ] && continue
    find "$DSH_HOME/sessions" -maxdepth 2 -type d -name "$id" -print -quit 2>/dev/null | grep -q . || echo "$id"
  done | wc -l | tr -d ' ')
  if [ "$missing" = "0" ]; then ok "every agent has a session on disk"; else bad "$missing agent session(s) have no directory"; fi
else
  meh "skipped — no roster yet"
fi

head_ "Secret and identity hygiene (working tree)"
# Deliberately a plain recursive grep rather than `git grep`: it must cover files that
# are new or not yet committed, and it must not depend on git's flag semantics.
#
# Note the pattern deliberately does NOT include "inloop". The original SmallPE project
# credits its sponsor (inloop.studio) in its own agent personas and PDF footers — that is
# upstream content, not something this integration introduced.
pattern='/Users/parolkar|ai\.parolkar\.com|PAROLKAR_PRIVATE|PAROLKAR_LOCAL|parolkar-private|192\.168\.|LINKEDIN_PASSWORD|inference\.do-ai\.run'
scan_common=(--exclude-dir=.git --exclude-dir=node_modules --exclude-dir=.pnpm-store
             --exclude-dir=home --exclude-dir=output --exclude-dir=vendor
             --exclude=verify-install.sh)
# Two passes: the repository (the Ruby gems under the ignored top-level `vendor/` are
# skipped for speed), then our own vendored plugins explicitly, because they carry the
# same directory name and would otherwise be skipped with them.
hits=$( { grep -rI -n -E "$pattern" "$ROOT" "${scan_common[@]}" 2>/dev/null
          grep -rI -n -E "$pattern" "$ROOT/dsh/vendor" 2>/dev/null; } | head -20)
if [ -z "$hits" ]; then ok "no leaked paths, hostnames, provider names or LAN addresses"
else bad "identity/secret strings found:"; printf '%s\n' "$hits" | sed 's/^/        /'; fi

# A real credential file must never be tracked, and node_modules must stay out.
if command -v git >/dev/null 2>&1 && git -C "$ROOT" rev-parse --git-dir >/dev/null 2>&1; then
  if git -C "$ROOT" ls-files --error-unmatch dsh/home/.credentials.yaml >/dev/null 2>&1; then
    bad "dsh/home/.credentials.yaml is TRACKED — it must never be committed"
  else ok "credentials file is not tracked"; fi
  if git -C "$ROOT" ls-files dsh/node_modules 2>/dev/null | grep -q .; then
    bad "dsh/node_modules is tracked — it must be gitignored"
  else ok "node_modules is not tracked"; fi
else
  meh "not a git checkout — tracked-file checks skipped"
fi

printf '\n\033[1mSummary:\033[0m %d passed, %d failed, %d warnings\n' "$pass" "$fail" "$warn"
[ "$fail" -eq 0 ] || exit 1
