#!/bin/bash
set -euo pipefail

echo "🚀 Setting up El Dorado TanStack development environment..."

# Ensure pnpm-owned directories are writable by the intended workspace user
echo "🔧 Ensuring workspace permissions..."
TARGET_USER="${DEVCONTAINER_USER:-node}"
if id "$TARGET_USER" >/dev/null 2>&1; then
  TARGET_UID="$(id -u "$TARGET_USER")"
  TARGET_GID="$(id -g "$TARGET_USER")"
else
  TARGET_UID="$(id -u)"
  TARGET_GID="$(id -g)"
fi

run_privileged() {
  if command -v sudo >/dev/null 2>&1; then
    sudo "$@"
  else
    "$@"
  fi
}

ensure_dir_owner() {
  local target="$1"
  if [ ! -d "$target" ]; then
    run_privileged mkdir -p "$target"
  fi
  run_privileged chown -R "$TARGET_UID":"$TARGET_GID" "$target"
}

ensure_dir_owner /workspace/node_modules
ensure_dir_owner /workspace/apps/web/node_modules
ensure_dir_owner /workspace/apps/server/node_modules
ensure_dir_owner /workspace/packages/domain/node_modules
ensure_dir_owner /workspace/.pnpm-store

# Install dependencies
echo "📦 Installing dependencies..."
export PNPM_YES=true
pnpm install --force

# Ensure Codex CLI is available globally for automation workflows
echo "🤖 Ensuring Codex CLI is installed..."
if ! command -v codex >/dev/null 2>&1; then
  run_privileged npm install -g @openai/codex
else
  echo "🤖 Codex CLI already present."
fi

# Build shared packages
echo "🔨 Building shared packages..."
pnpm --filter @game/domain build || true

# TODO: add database initialization scripts as needed

echo "✅ Development environment ready!"
echo "🌐 Web client: http://localhost:3000"
echo "🔧 Server API: http://localhost:3001"
echo "🗄️ PostgreSQL: localhost:5432"
echo "⚡ Redis: localhost:6379"
