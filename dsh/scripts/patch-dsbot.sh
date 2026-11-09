#!/usr/bin/env bash
#
# Re-apply every patch SmallPE makes to the installed ds-bot bundle.
#
# **Run this after any pnpm install that touches the web profile.** pnpm restores
# `node_modules/ds-bot/client.js` from its store whenever it materialises the profile
# again, which silently undoes all three patches below. The symptom is not a build
# failure — each script reports success, and the finished image simply does not have the
# changes.
#
# That is exactly how the Classic mode button went missing from the container while
# working locally. The Dockerfile runs
#
#     ./bin/install.sh ... && ./dsh/scripts/install-tools.sh \
#       && node dsh/scripts/provision-bots.mjs && ./dsh/scripts/enable-auth.sh
#
# and enable-auth.sh begins with `dsh plugin --profile web add dsh-ui-auth` — a pnpm
# install of 56 packages. In the built image the evidence was in the mtimes:
#
#     01:49:47  ds-bot/package.json     <- the install.sh install
#     01:49:47  ds-bot/index.js         <- the install.sh install
#     01:51:05  ds-bot/client.js        <- rewritten 78s later
#     01:51:05  .modules.yaml           <- pnpm writes this when an install finishes
#
# Only the file we had patched was rewritten, in the second pnpm finished adding
# dsh-ui-auth. A local install does not reproduce it: the patch is written through
# pnpm's hardlink into the local store, so a later install restores bytes that are
# already patched. A fresh container store holds the pristine copy.
#
# Each script is idempotent and refuses to apply against a ds-bot it does not recognise,
# so calling this more often than necessary is free and a reworded upstream release
# fails the build loudly rather than shipping a half-branded UI.
#
# Usage:  ./dsh/scripts/patch-dsbot.sh

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DSH_DIR="$ROOT/dsh"
# Never inherit DSH_HOME: a nested DSH session exports its own, and this must always
# operate on this repository's harness home.
export DSH_HOME="${SMALLPE_DSH_HOME:-$DSH_DIR/home}"

die() { echo "" >&2; echo "ERROR: $*" >&2; exit 1; }

# ds-bot@0.2.0 looked for its activity-indicator portal with a direct-child selector that
# DSH 0.2.1-rc.2 no longer produces, so an agent appeared to do nothing at all until its
# whole reply landed. A no-op on releases that already use the descendant selector.
node "$DSH_DIR/scripts/patch-dsbot-typing.mjs" \
  || die "patching the ds-bot typing indicator failed. Read dsh/scripts/patch-dsbot-typing.mjs — ds-bot has probably changed how it mounts the indicator."

# This install is a SmallPE adaptation, but ds-bot's bundled UI still says "DS Bot" in the
# settings nav, the error-source labels, the update banners and the Feedback page — which
# also offers to file a bug on the upstream repository. Text and feedback destination only;
# no element or handler is touched.
node "$DSH_DIR/scripts/patch-dsbot-branding.mjs" \
  || die "re-branding the ds-bot UI failed. Read dsh/scripts/patch-dsbot-branding.mjs — ds-bot has probably reworded its UI."

# A "Classic mode" button beside the account control at the sidebar foot. ds-bot paints
# its own column over the shell's sidebar, so the documented `sidebar.footer.action` seat
# is invisible in bot mode and the button has to be rendered inside ds-bot's component.
node "$DSH_DIR/scripts/patch-dsbot-classic-switch.mjs" \
  || die "adding the ds-bot Classic mode button failed. Read dsh/scripts/patch-dsbot-classic-switch.mjs — ds-bot has probably changed its sidebar foot."
