#!/usr/bin/env bash
#
# Optional: put a login in front of the SmallPE Web UI.
#
# The default install is loopback-only (127.0.0.1) and deliberately has NO login, so
# `./bin/install.sh && ./bin/run.sh` just works. Enable this only when you are exposing
# the UI to other people or beyond localhost — for example behind a reverse proxy with
# bin/run.sh's DSH_PUBLIC_URL / DSH_TRUSTED_HOST.
#
# `dsh-ui-auth` writes its own login page, then generates an `admin` account on first
# start and prints the one-time password to the console (and to a
# dsh-ui-auth-bootstrap.txt next to its working directory).
#
# The companion `@local/dsbot-auth-bridge` plugin is already in the profile: it opens
# exactly one route (POST /api/bot) through the auth gateway so the DS Bot panels keep
# working once the gateway is active. Without dsh-ui-auth it simply stays idle.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DSH_DIR="$ROOT/dsh"
# Never inherit DSH_HOME: a nested DSH session exports its own, and this must always
# operate on this repository's harness home.
export DSH_HOME="${SMALLPE_DSH_HOME:-$DSH_DIR/home}"
export PATH="$DSH_DIR/node_modules/.bin:$PATH"
cd "$ROOT"

[ -x "$DSH_DIR/node_modules/.bin/dsh" ] || { echo "Run ./bin/install.sh first." >&2; exit 1; }

echo "==> Enabling dsh-ui-auth in the 'web' profile"
"$DSH_DIR/node_modules/.bin/dsh" plugin --profile web add dsh-ui-auth

# dsh-ui-auth is a Chinese plugin that translates itself at run time, but its post-login
# TOTP reminder is built outside the roots its own localiser sweeps, so it stays Chinese on
# an English install. Put that one dialog into English; see the script for the detail.
# Re-running is safe, and it exits 0 when the plugin is absent.
echo "==> Translating the dsh-ui-auth TOTP reminder"
node "$DSH_DIR/scripts/localize-ui-auth.mjs"

# dsh-ui-auth scopes every workspace to a single owner, but the SmallPE DS Bot team folder
# has to be visible to the whole team — the nine agents are shared colleagues. Teach its two
# ownership predicates about a shared scope; @local/smallpe-user-workspaces publishes what
# is in it. See the script for why this cannot be done through registerPolicy.
echo "==> Teaching dsh-ui-auth about the shared DS Bot workspace"
node "$DSH_DIR/scripts/patch-ui-auth-sharing.mjs"

# dsh-ui-auth renders its own sign-in pages in the host, headed "DeepSeek Harness", and no
# branding plugin can reach them: dsh-custom-logo only restyles the in-app sidebar, and
# @local/smallpe-brand taps index.html, which a signed-out visitor never receives. Put the
# configured logo on them. It is inlined rather than linked because the gateway 401s every
# path outside /auth/*; see the script.
echo "==> Branding the dsh-ui-auth sign-in pages"
node "$DSH_DIR/scripts/patch-ui-auth-branding.mjs"

cat <<'EOF'

Done. Restart the harness with ./bin/run.sh, then open http://127.0.0.1:3080 —
with the gateway installed there is no launch-token URL to copy; it serves its
own login page and does that exchange for you.

On first start, dsh-ui-auth creates an "admin" account and prints its one-time
password to the console. Its logs are Chinese only: read 用户名 as username and
密码 as password. The same credentials are written next to the workspace in
dsh-ui-auth-bootstrap.txt. Keep them safe — they gate your whole UI.

To go back to the no-login local mode: remove the plugin and restart.
  ./dsh/node_modules/.bin/dsh plugin --profile web remove dsh-ui-auth

EOF
