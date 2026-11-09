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

# $DATA/workspaces (plural) holds one personal workspace per dsh-ui-auth user, created by
# @local/smallpe-user-workspaces. It is a SIBLING of $DATA/workspace, never inside it:
# that one is the shared DS Bot team folder the nine agents work in, so personal folders
# nested there would land in the agents' tree and in everybody's view of it.
mkdir -p "$DATA/home" "$DATA/workspace" "$DATA/workspaces" "$DATA/cache/tectonic"
if ! mountpoint -q "$DATA"; then
  say "WARNING: no volume is mounted at $DATA — agents, conversations, logins and every user's workspace will be lost on every redeploy."
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

# Seed the tectonic cache from the image before linking the live path at it. The image
# warms this cache during the build (see the Dockerfile): on a cold cache the first PDF
# takes ~6 minutes because tectonic fetches the whole LaTeX package set, against ~1.5s
# warm. Without this the symlink would point at an empty volume directory and the very
# first document an agent produces would pay that cost again — once per volume, and once
# more whenever the volume is recreated.
if [ -d "$DSH_DIR/.tectonic-cache.dist" ]; then
  copy_missing "$DSH_DIR/.tectonic-cache.dist" "$DATA/cache/tectonic"
fi
link_to_volume "$DSH_DIR/.tectonic-cache" "$DATA/cache/tectonic"
say "harness home: $DSH_DIR/home -> $DATA/home"
say "workspace   : $WORKSPACE -> $DATA/workspace"

# Where @local/smallpe-user-workspaces puts each user's own workspace. Named explicitly
# rather than left to the plugin's default, because that default is derived from DSH_HOME
# and DSH_HOME is a symlink here — the plugin would resolve it to a path on the volume
# either way, but a deployment should not depend on that coincidence.
export SMALLPE_USER_WORKSPACES_ROOT="$DATA/workspaces"
say "user spaces : $SMALLPE_USER_WORKSPACES_ROOT/<username>"

# Model routes every signed-in user may run, on top of any model profile of their own.
#
# dsh-ui-auth decides what a non-admin may use from their own model profiles and the ones
# an admin shared with them; a user who has configured none gets an empty catalogue and
# cannot run anything. SmallPE configures OpenRouter once for the whole deployment (see the
# profile's cordis.patch.yml, keyed by OPENROUTER_API_KEY), which is a route and not a
# profile — so without this the team signs in to an empty model picker.
#
# The key is NOT exposed by this: it stays in the environment, and Settings and credentials
# remain administrator-only. Users get the route, never the secret. Set it empty to go back
# to per-user profiles only.
: "${SMALLPE_DEFAULT_PROVIDERS:=openrouter}"
export SMALLPE_DEFAULT_PROVIDERS
say "model routes: ${SMALLPE_DEFAULT_PROVIDERS:-<none — each user needs their own profile>}"

# The agents were provisioned in the image, where the workspace was the real folder
# $WORKSPACE; DSH stored that path for the workspace and for each session. It is a
# link now, and DSH compares a session's realpath with the stored path, so new
# sessions and bots failed with "cannot attach session … its cwd resolves to
# $DATA/workspace". Point the stored references at the real location. Matching on
# the quoted path keeps *.dist and longer names untouched; after the first boot
# nothing matches. grep -r does not follow the profiles/branding links.
{ grep -rlIZ -e "\"$WORKSPACE\"" -e "\"$WORKSPACE/" "$DATA/home" 2>/dev/null || true; } \
  | xargs -0 -r sed -i -e "s#\"$WORKSPACE\"#\"$DATA/workspace\"#g" -e "s#\"$WORKSPACE/#\"$DATA/workspace/#g"

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

# The deployer's choice of password for the first admin. Kept out of the harness's
# environment: agents run shell commands under it, and anyone allowed to chat with one
# could otherwise read the admin password back.
admin_password="${SMALLPE_ADMIN_PASSWORD:-}"
unset SMALLPE_ADMIN_PASSWORD

if [ -f "$DATA/workspace/dsh-ui-auth-bootstrap.txt" ] && [ -z "$admin_password" ]; then
  say "the initial admin password has not been changed yet; it is in $DATA/workspace/dsh-ui-auth-bootstrap.txt"
elif [ -z "$admin_password" ]; then
  # dsh-ui-auth logs only in Chinese. When it has no account yet it creates one.
  say "if a [dsh-ui-auth] block follows, it is the first admin account: 用户名 = username, 密码 = one-time password."
  say "set SMALLPE_ADMIN_PASSWORD to choose that password instead."
fi

node "$DSH_DIR/scripts/forward-port.mjs" &
forward=$!
"$ROOT/bin/run.sh" &
harness=$!

# Replace the admin's one-time password with SMALLPE_ADMIN_PASSWORD. Best effort, in the
# background, and a no-op once that password has been changed (here or in the UI).
if [ -n "$admin_password" ]; then
  SMALLPE_ADMIN_PASSWORD="$admin_password" \
    node "$DSH_DIR/scripts/set-admin-password.mjs" "$DATA/workspace/dsh-ui-auth-bootstrap.txt" &
fi

stop() { kill -TERM "$harness" "$forward" 2>/dev/null || true; }
trap stop TERM INT

# Whichever exits first takes the container down with it, so the platform restarts it.
set +e
wait -n "$harness" "$forward"
status=$?
stop
wait
exit "$status"
