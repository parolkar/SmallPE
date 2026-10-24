#!/usr/bin/env bash
#
# Vendor SmallPE's document toolchain into ./dsh/bin.
#
# Pandoc is mounted as an MCP server and the agent prompts also shell out to
# `pandoc` directly for the PDF pipeline, so three third-party programs are
# needed. Rather than send people to Homebrew, this script downloads them into
# ./dsh/bin, which bin/run.sh puts first on PATH — so they live inside the
# repository and disappear with it, like everything else here.
#
#   uv / uvx   launches the Pandoc MCP server
#   pandoc     performs the conversions
#   tectonic   renders PDF; a single self-contained binary that fetches the
#              LaTeX packages it needs on first use, instead of a multi-GB
#              TeX Live installation
#
# Versions are pinned so two people installing the same commit get the same
# tools. Override with UV_VERSION / PANDOC_VERSION / TECTONIC_VERSION.
#
# Usage:  ./dsh/scripts/install-tools.sh [--force]
#
# Requires: curl, and tar or unzip (all shipped with macOS and mainstream Linux).

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BIN_DIR="$ROOT/dsh/bin"

UV_VERSION="${UV_VERSION:-0.13.5}"
PANDOC_VERSION="${PANDOC_VERSION:-3.12.1}"
TECTONIC_VERSION="${TECTONIC_VERSION:-0.17.0}"

FORCE=0
for arg in "$@"; do
  case "$arg" in
    --force) FORCE=1 ;;
    -h|--help) sed -n '2,22p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "install-tools: unknown option '$arg'" >&2; exit 2 ;;
  esac
done

say()  { printf '\033[1;36m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[!]\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[1;31m[x]\033[0m %s\n' "$*" >&2; exit 1; }

# --- which build of each tool this machine needs ----------------------------- #
detect_platform() {
  local os arch
  os="$(uname -s)"
  arch="$(uname -m)"
  case "$os/$arch" in
    Darwin/arm64)  UV_TARGET=aarch64-apple-darwin ; PANDOC_TARGET=arm64-macOS      ; TECTONIC_TARGET=aarch64-apple-darwin ;;
    Darwin/x86_64) UV_TARGET=x86_64-apple-darwin  ; PANDOC_TARGET=x86_64-macOS     ; TECTONIC_TARGET=x86_64-apple-darwin ;;
    Linux/x86_64)  UV_TARGET=x86_64-unknown-linux-gnu ; PANDOC_TARGET=linux-amd64  ; TECTONIC_TARGET=x86_64-unknown-linux-gnu ;;
    Linux/aarch64) UV_TARGET=aarch64-unknown-linux-gnu; PANDOC_TARGET=linux-arm64  ; TECTONIC_TARGET=aarch64-unknown-linux-gnu ;;
    *) die "no prebuilt toolchain for ${os}/${arch}. Install uv, pandoc and tectonic yourself, or set UV_TARGET/PANDOC_TARGET/TECTONIC_TARGET." ;;
  esac
}

command -v curl >/dev/null 2>&1 || die "curl is required to download the toolchain."
detect_platform

has_unzip()  { command -v unzip >/dev/null 2>&1; }
has_tar()    { command -v tar >/dev/null 2>&1; }
case "$PANDOC_TARGET" in
  *macOS*) has_unzip || die "unzip is required to unpack pandoc." ;;
  *) has_tar || die "tar is required to unpack pandoc." ;;
esac
has_tar || die "tar is required to unpack uv and tectonic."

mkdir -p "$BIN_DIR"

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

fetch() {
  local url="$1" out="$2"
  curl -fsSL --retry 3 --retry-delay 2 --max-time 900 "$url" -o "$out" \
    || die "download failed: $url"
}

# install_bin <source-file> <name-in-bin>
install_bin() {
  local src="$1" name="$2"
  [ -f "$src" ] || die "expected $name in the downloaded archive, but it is not there."
  install -m 0755 "$src" "$BIN_DIR/$name"
}

# --- uv + uvx ---------------------------------------------------------------- #
if [ "$FORCE" -eq 0 ] && [ -x "$BIN_DIR/uvx" ] && [ -x "$BIN_DIR/uv" ]; then
  say "uv already vendored ($("$BIN_DIR/uv" --version 2>/dev/null || echo unknown))"
else
  say "Downloading uv ${UV_VERSION} (${UV_TARGET})"
  fetch "https://github.com/astral-sh/uv/releases/download/${UV_VERSION}/uv-${UV_TARGET}.tar.gz" "$WORK/uv.tar.gz"
  mkdir -p "$WORK/uv" && tar -xzf "$WORK/uv.tar.gz" -C "$WORK/uv"
  install_bin "$(find "$WORK/uv" -type f -name uv  -print -quit)"  uv
  install_bin "$(find "$WORK/uv" -type f -name uvx -print -quit)" uvx
fi

# --- pandoc ------------------------------------------------------------------ #
if [ "$FORCE" -eq 0 ] && [ -x "$BIN_DIR/pandoc" ]; then
  say "pandoc already vendored ($("$BIN_DIR/pandoc" --version 2>/dev/null | head -1 || echo unknown))"
else
  say "Downloading pandoc ${PANDOC_VERSION} (${PANDOC_TARGET})"
  case "$PANDOC_TARGET" in
    *macOS*)
      fetch "https://github.com/jgm/pandoc/releases/download/${PANDOC_VERSION}/pandoc-${PANDOC_VERSION}-${PANDOC_TARGET}.zip" "$WORK/pandoc.zip"
      mkdir -p "$WORK/pandoc" && unzip -q "$WORK/pandoc.zip" -d "$WORK/pandoc"
      ;;
    *)
      fetch "https://github.com/jgm/pandoc/releases/download/${PANDOC_VERSION}/pandoc-${PANDOC_VERSION}-${PANDOC_TARGET}.tar.gz" "$WORK/pandoc.tar.gz"
      mkdir -p "$WORK/pandoc" && tar -xzf "$WORK/pandoc.tar.gz" -C "$WORK/pandoc"
      ;;
  esac
  install_bin "$(find "$WORK/pandoc" -type f -name pandoc -print -quit)" pandoc
fi

# --- tectonic ---------------------------------------------------------------- #
if [ "$FORCE" -eq 0 ] && [ -x "$BIN_DIR/tectonic" ]; then
  say "tectonic already vendored ($("$BIN_DIR/tectonic" --version 2>/dev/null | head -1 || echo unknown))"
else
  say "Downloading tectonic ${TECTONIC_VERSION} (${TECTONIC_TARGET})"
  fetch "https://github.com/tectonic-typesetting/tectonic/releases/download/tectonic%40${TECTONIC_VERSION}/tectonic-${TECTONIC_VERSION}-${TECTONIC_TARGET}.tar.gz" "$WORK/tectonic.tar.gz"
  mkdir -p "$WORK/tectonic" && tar -xzf "$WORK/tectonic.tar.gz" -C "$WORK/tectonic"
  install_bin "$(find "$WORK/tectonic" -type f -name tectonic -print -quit)" tectonic
fi

# --- prove they run ---------------------------------------------------------- #
say "Checking the vendored tools"
fail=0
for tool in uv uvx pandoc tectonic; do
  if out=$("$BIN_DIR/$tool" --version 2>&1 | head -1) && [ -n "$out" ]; then
    printf '  \033[32mok\033[0m   %-9s %s\n' "$tool" "$out"
  else
    printf '  \033[31mFAIL\033[0m %-9s %s\n' "$tool" "${out:-did not run}"; fail=1
  fi
done
[ "$fail" -eq 0 ] || die "a vendored tool did not run; the build downloaded may not match this platform."

echo
say "Vendored into $BIN_DIR — bin/run.sh puts it first on PATH."

# --- brand fonts header ------------------------------------------------------- #
# The branded PDF pipeline sets its Inter and Fira Code faces from the TTFs this
# repository ships. fontspec can only open them by ABSOLUTE path: tectonic
# resolves relative paths against the directory of the .tex file it compiles, and
# pandoc compiles from a temporary directory, so a relative path breaks the moment
# the PDF lands anywhere but the current directory. This header is therefore
# generated at install time with absolute paths. It is gitignored — regenerate it
# by re-running this script (bin/install.sh does) if the repository moves.
FONT_DIRS="$ROOT/agentic-team-for-private-equity/SmallPE-presentations/theme/assets/fonts"
GENERATED="$ROOT/agentic-team-for-private-equity/templates/brand-fonts.tex"
cat > "$GENERATED" <<EOF
% Generated by dsh/scripts/install-tools.sh — machine-local absolute font paths.
% Do not edit or commit; re-run ./bin/install.sh if the repository moves.
\\setsansfont[
  Path = $FONT_DIRS/inter/,
  BoldFont = Inter_18pt-Bold.ttf,
  ItalicFont = Inter_18pt-Italic.ttf,
  BoldItalicFont = Inter_18pt-ExtraBoldItalic.ttf
]{Inter_18pt-Regular.ttf}
\\setmonofont[
  Path = $FONT_DIRS/fira-code/,
  BoldFont = FiraCode-Bold.ttf
]{FiraCode-Regular.ttf}
EOF
say "Brand-font header written: agentic-team-for-private-equity/templates/brand-fonts.tex"

echo
echo "    Note: tectonic fetches the LaTeX packages it needs on first PDF render, so that first"
echo "    conversion needs network access. Later ones are cached in dsh/.tectonic-cache."
