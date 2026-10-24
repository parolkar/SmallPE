#!/usr/bin/env bash
#
# Optional: put a login in front of the SmallPE Web UI.
#
# The default install is loopback-only (127.0.0.1) and deliberately has NO login, so
# `./install.sh && ./run.sh` just works. Enable this only when you are exposing the UI
# to other people or beyond localhost — for example behind a reverse proxy with
# run.sh's DSH_PUBLIC_URL / DSH_TRUSTED_HOST.
#
# `dsh-ui-auth` writes its own login page, then generates an `admin` account on first
# start and prints the one-time password to the console (and to
# dsh-ui-auth-bootstrap.txt next to the launch directory).
#
# The companion `@local/dsbot-auth-bridge` plugin is already in the profile: it opens
# exactly one route (POST /api/bot) through the auth gateway so the DS Bot panels keep
# working once the gateway is active. Without dsh-ui-auth it simply stays idle.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DSH_DIR="$ROOT/dsh"
export DSH_HOME="${DSH_HOME:-$DSH_DIR/home}"
export PATH="$DSH_DIR/node_modules/.bin:$PATH"
cd "$ROOT"

[ -x "$DSH_DIR/node_modules/.bin/dsh" ] || { echo "Run ./install.sh first." >&2; exit 1; }

echo "==> Enabling dsh-ui-auth in the 'web' profile"
"$DSH_DIR/node_modules/.bin/dsh" plugin --profile web add dsh-ui-auth

cat <<'EOF'

Done. Restart the harness with ./run.sh.

On first start, dsh-ui-auth creates an "admin" account and prints its one-time
password to the console. Keep that password safe — it gated your whole UI.

To go back to the no-login local mode: remove the plugin and restart.
  ./dsh/node_modules/.bin/dsh plugin --profile web remove dsh-ui-auth

EOF
