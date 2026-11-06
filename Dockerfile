# SmallPE on DeepSeek Harness, as one container image (used by Railway).
#
# The build is ./bin/install.sh plus the two steps a public deployment needs: the
# nine agents are provisioned into the image, and the dsh-ui-auth login is switched
# on (provisioning cannot run behind it, so it comes after). bin/container-start.sh
# then moves all state onto a volume at boot. See DSH-README.md, "Deploying to Railway".
FROM node:22-bookworm-slim

# curl, tar, unzip  dsh/scripts/install-tools.sh
# git               npm/pnpm dependency fetches
# chromium          the agents' browser tools
# tini              PID 1: reaps the MCP servers and browsers the harness spawns
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl git tar unzip chromium tini \
 && rm -rf /var/lib/apt/lists/*

# Debian's /usr/bin/chromium wrapper reads /etc/chromium.d. In a container it runs as
# root without user namespaces, so it needs --no-sandbox, and /dev/shm is small.
RUN echo 'export CHROMIUM_FLAGS="$CHROMIUM_FLAGS --no-sandbox --disable-dev-shm-usage"' \
      > /etc/chromium.d/smallpe-container
ENV SMALLPE_CHROMIUM_PATH=/usr/bin/chromium

WORKDIR /app
COPY . .

# install.sh only warns when the toolchain or provisioning fails, which suits a laptop
# but would ship a broken image; here both run on their own and fail the build.
RUN ./bin/install.sh --skip-provision --skip-tools \
 && ./dsh/scripts/install-tools.sh \
 && node dsh/scripts/provision-bots.mjs \
 && ./dsh/scripts/enable-auth.sh

# dsh-ui-auth proxies the UI's live connection (/api/remote.mux) back to DSH at the
# browser's Host header. Behind Railway's edge, or any port mapping, that is not where
# DSH listens, so the upstream fails, the socket is closed at once and the UI sits on
# "Reconnecting…". Let DSH_AUTH_MUX_UPSTREAM (set by container-start.sh) name DSH's own
# listener instead. The grep fails the build if a dsh-ui-auth release moves that line.
RUN f=dsh/home/profiles/web/node_modules/dsh-ui-auth/lib/modern-gateway.js \
 && grep -q 'ws://${info.host}/api/remote.mux' "$f" \
 && sed -i 's#ws://${info.host}/api/remote.mux#ws://${process.env.DSH_AUTH_MUX_UPSTREAM || info.host}/api/remote.mux#' "$f" \
 && grep -q 'DSH_AUTH_MUX_UPSTREAM' "$f"

# Warm uvx's cache with the Pandoc MCP server, so each boot does not fetch it again.
# Best effort: without it the server is simply fetched on first use.
RUN PATH="/app/dsh/bin:$PATH" UV_CACHE_DIR=/app/dsh/.uv-cache UV_PYTHON_INSTALL_DIR=/app/dsh/.uv-python \
      timeout 300 uvx mcp-pandoc </dev/null >/dev/null 2>&1 || true

# Keep the installed home and workspace as pristine copies; container-start.sh links
# the original paths to their persistent counterparts on the volume. The pnpm store
# is only needed to install plugins, which happens here, not at run time.
RUN rm -rf dsh/.pnpm-store /root/.npm /root/.cache \
 && mv dsh/home dsh/home.dist \
 && mv agentic-team-for-private-equity agentic-team-for-private-equity.dist

EXPOSE 8080
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["./bin/container-start.sh"]
