#!/usr/bin/env bash
#
# SmallPE — start the harness inside the container image (Docker, Railway).
#
# The image (see Dockerfile) is a finished ./bin/install.sh: the runtime, the profile
# plugins, the document toolchain, the nine provisioned agents and the dsh-ui-auth
# login. It keeps two pristine copies that this script turns into persistent state:
#
#   dsh/home.dist                          -> $DATA/home       ($DSH_HOME)
#   agentic-team-for-private-equity.dist   -> $DATA/workspace  (the team workspace)
#
# and links the original paths to them, so everything bin/run.sh and the profile
# expect is where the contract says it is.
#
#   persistent ($DATA)  conversations, agent roster, memory, credentials, logins,
#                       and everything the agents write in the workspace
#   from the image      the profile (configuration + plugins) and branding, refreshed
#                       on every deploy so a new image never runs on stale plugins
#
# Workspace files a later commit adds are copied in on the next boot; files already
# in $DATA are never overwritten.
#
# $DATA is SMALLPE_DATA_DIR, else Railway's RAILWAY_VOLUME_MOUNT_PATH, else /data.
# Without a volume mounted there, everything is lost on each redeploy.
#
# Then it runs bin/run.sh on 127.0.0.1:$DSH_PORT and forwards $PORT to it.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DSH_DIR="$ROOT/dsh"
WORKSPACE="$ROOT/agentic-team-for-private-equity"
DATA="${SMALLPE_DATA_DIR:-${RAILWAY_VOLUME_MOUNT_PATH:-/data}}"

say() { printf '[smallpe] %s\n' "$*"; }

if [ ! -d "$DSH_DIR/home.dist" ] || [ ! -d "$WORKSPACE.dist" ]; then
  say "this script starts the SmallPE container image; on a local install use ./bin/run.sh" >&2
  exit 1
fi

mkdir -p "$DATA/home" "$DATA/workspace" "$DATA/cache/tectonic"
if ! mountpoint -q "$DATA"; then
  say "WARNING: no volume is mounted at $DATA — agents, conversations and logins will be lost on every redeploy."
fi

# copy_missing <from> <to> [tar options] — add what <to> lacks, never overwrite.
copy_missing() {
  local from="$1" to="$2"
  shift 2
  tar -C "$from" "$@" -cf - . | tar -C "$to" -xf - --skip-old-files
}

# --- the harness home ---------------------------------------------------------- #
# Seeded once: after that the roster and its sessions belong to the user, and
# re-adding a file they removed (a deleted agent's session) would corrupt the team.
if [ ! -e "$DATA/home/bot/state.json" ]; then
  say "first boot: seeding the harness home in $DATA/home"
  copy_missing "$DSH_DIR/home.dist" "$DATA/home" --exclude=./profiles --exclude=./branding
fi
# Skills shipped by a later commit are added; local ones are left alone.
mkdir -p "$DATA/home/skills"
copy_missing "$DSH_DIR/home.dist/skills" "$DATA/home/skills"
for entry in profiles branding; do
  rm -rf "$DATA/home/$entry"
  ln -s "$DSH_DIR/home.dist/$entry" "$DATA/home/$entry"
done
# Only this container uses the volume, so a lock left behind by the previous one
# (which ran on another hostname) is stale; without this DS Bot would open the team
# read-only for the first minute after a crash.
rm -f "$DATA/home/bot/state.lock"

# --- the team workspace -------------------------------------------------------- #
copy_missing "$WORKSPACE.dist" "$DATA/workspace"

# link_to_volume <path> <target> — make <path> a symlink to <target> on the volume.
# The Dockerfile moves these paths to *.dist, but some image builders (Railway's among
# them) still ship the directory a later layer moved away. Left in place, `ln` would
# only drop a link inside it and the harness would write to the container's throwaway
# filesystem, so remove it (the pristine copy is the .dist one) and verify the result.
link_to_volume() {
  local path="$1" target="$2"
  if [ -e "$path" ] && [ ! -L "$path" ]; then
    rm -rf "$path"
  fi
  ln -sfn "$target" "$path"
  if [ "$(readlink -f "$path")" != "$(readlink -f "$target")" ]; then
    say "ERROR: $path does not lead to $target; refusing to run off the volume." >&2
    exit 1
  fi
}
link_to_volume "$DSH_DIR/home" "$DATA/home"
link_to_volume "$WORKSPACE" "$DATA/workspace"
link_to_volume "$DSH_DIR/.tectonic-cache" "$DATA/cache/tectonic"
say "harness home: $DSH_DIR/home -> $DATA/home"
say "workspace   : $WORKSPACE -> $DATA/workspace"

# --- serving ------------------------------------------------------------------- #
# DSH binds loopback only (wildcards are rejected); forward-port.mjs publishes it.
export DSH_HOST=127.0.0.1
export DSH_PORT="${DSH_PORT:-3080}"
export PORT="${PORT:-8080}"
# Where dsh-ui-auth reconnects the UI's live channel (see the Dockerfile).
export DSH_AUTH_MUX_UPSTREAM="127.0.0.1:$DSH_PORT"

# Behind Railway's HTTPS edge: advertise and trust its public domain, and let
# dsh-ui-auth read the client address and scheme from the edge's X-Forwarded-*.
if [ -n "${RAILWAY_PUBLIC_DOMAIN:-}" ]; then
  : "${DSH_PUBLIC_URL:=https://$RAILWAY_PUBLIC_DOMAIN/}"
  : "${DSH_TRUSTED_HOST:=$RAILWAY_PUBLIC_DOMAIN}"
  : "${DSH_AUTH_TRUST_PROXY:=1}"
  export DSH_PUBLIC_URL DSH_TRUSTED_HOST DSH_AUTH_TRUST_PROXY
fi

if [ -f "$DATA/workspace/dsh-ui-auth-bootstrap.txt" ]; then
  say "the initial admin password has not been changed yet; it is in $DATA/workspace/dsh-ui-auth-bootstrap.txt"
else
  # dsh-ui-auth logs only in Chinese. When it has no account yet it creates one.
  say "if a [dsh-ui-auth] block follows, it is the first admin account: 用户名 = username, 密码 = one-time password."
fi

node "$DSH_DIR/scripts/forward-port.mjs" &
forward=$!
"$ROOT/bin/run.sh" &
harness=$!

stop() { kill -TERM "$harness" "$forward" 2>/dev/null || true; }
trap stop TERM INT

# Whichever exits first takes the container down with it, so the platform restarts it.
set +e
wait -n "$harness" "$forward"
status=$?
stop
wait
exit "$status"
