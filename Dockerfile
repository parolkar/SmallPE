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
# ruby + build chain
#                   the workspace's own tools/pdf_to_markdown/pdf2md and
#                   tools/excel_to_markdown/excel2md are Ruby, and every agent persona
#                   plus agents/shared-tools.md instructs agents to use them. Without a
#                   Ruby the documentation is simply false, and agents rediscover that
#                   mid-job and hand-roll a replacement. ruby-dev and build-essential are
#                   needed because the lockfiles pin gems (bigdecimal) that Debian's
#                   default gems do not satisfy; nokogiri resolves to a precompiled
#                   linux platform gem, so nothing large is compiled.
# poppler-utils     pdftotext/pdfinfo. The pdf-to-markdown Gemfile's `pdftotext` gem
#                   shells out to this binary, and pdfinfo answers "how many pages did we
#                   produce?" in one call — previously done with strings|grep archaeology.
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl git tar unzip chromium tini \
      ruby ruby-dev build-essential poppler-utils \
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

# Install the workspace's Ruby tools' gems so pdf2md/excel2md run the moment an agent
# calls them.
#
# System-wide, deliberately, not into vendor/bundle: both scripts do a bare `require
# 'thor'` with no bundler/setup, and agents/shared-tools.md tells agents to run
#   ./tools/pdf_to_markdown/pdf2md convert document.pdf -o output.md
# directly. A vendored bundle would only be visible under `bundle exec`, so the documented
# invocation would still fail. System gems also survive the workspace moving onto the
# volume at boot, which a vendor/ directory inside the tool would have to be copied with.
#
# The smoke test is part of the build: a missing gem must fail here, not in front of an
# agent mid-job.
RUN for tool in pdf_to_markdown excel_to_markdown; do \
      ( cd "/app/agentic-team-for-private-equity/tools/$tool" && bundle install ) || exit 1; \
    done \
 && /app/agentic-team-for-private-equity/tools/pdf_to_markdown/pdf2md help convert >/dev/null \
 && /app/agentic-team-for-private-equity/tools/excel_to_markdown/excel2md help convert >/dev/null \
 && echo "ruby tools ready: $(ruby -v)"

# Warm tectonic's LaTeX package cache by rendering one throwaway document with the real
# defaults. Measured on a clean cache: the first PDF takes 5m49s because tectonic fetches
# the whole package set over the network; every later build takes 1.5s. Baking the ~44MB
# cache into the image turns an agent's first PDF from a six-minute stall into a second,
# and removes the hard network dependency at that moment.
#
# Kept as .dist and seeded onto the volume by container-start.sh, exactly like home.dist:
# the runtime path is a symlink to persistent storage, so warming the real path here would
# be discarded on first boot.
RUN printf '%s\n' '---' 'title: Cache Warm' '---' '' '# Warm' '' 'Body **text** and an arrow ->.' \
      > /tmp/warm.md \
 && ( cd /app/agentic-team-for-private-equity \
      && PATH="/app/dsh/bin:$PATH" TECTONIC_CACHE_DIR=/app/dsh/.tectonic-cache \
         pandoc --defaults=templates/pandoc-defaults.yml /tmp/warm.md -o /tmp/warm.pdf ) \
 && pdfinfo /tmp/warm.pdf | head -3 \
 && rm -f /tmp/warm.md /tmp/warm.pdf \
 && du -sh /app/dsh/.tectonic-cache

# Warm uvx's cache with the Pandoc MCP server, so each boot does not fetch it again.
# Best effort: without it the server is simply fetched on first use.
RUN PATH="/app/dsh/bin:$PATH" UV_CACHE_DIR=/app/dsh/.uv-cache UV_PYTHON_INSTALL_DIR=/app/dsh/.uv-python \
      timeout 300 uvx mcp-pandoc </dev/null >/dev/null 2>&1 || true

# Keep the installed home and workspace as pristine copies; container-start.sh links
# the original paths to their persistent counterparts on the volume. The pnpm store
# is only needed to install plugins, which happens here, not at run time.
# The warmed tectonic cache is kept the same way: container-start.sh seeds the volume
# from it on first boot, then links the live path there.
RUN rm -rf dsh/.pnpm-store /root/.npm /root/.cache \
 && mv dsh/home dsh/home.dist \
 && mv agentic-team-for-private-equity agentic-team-for-private-equity.dist \
 && mv dsh/.tectonic-cache dsh/.tectonic-cache.dist

EXPOSE 8080
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["./bin/container-start.sh"]
