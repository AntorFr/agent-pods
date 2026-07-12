#!/bin/bash
# Start the VS Code tunnel. First run prints a device-code login URL to the
# logs (kubectl logs); the resulting token lands in ~/.vscode-cli, which must
# be a persistent volume so later restarts reconnect silently.
set -eu

# Seed git identity on the persisted home, once (skipped if already set)
if [ -n "${GIT_USER_NAME:-}" ] && ! git config --global user.name >/dev/null 2>&1; then
    git config --global user.name "${GIT_USER_NAME}"
fi
if [ -n "${GIT_USER_EMAIL:-}" ] && ! git config --global user.email >/dev/null 2>&1; then
    git config --global user.email "${GIT_USER_EMAIL}"
fi

# Mirror the tunnel output into the (shared, persistent) home so a sidecar
# gateway can surface the device-code login prompt without Kubernetes API
# access. One file per run; `exec code` keeps signal handling intact.
TUNNEL_LOG="${TUNNEL_LOG:-$HOME/.vscode-cli/tunnel.out}"
mkdir -p "$(dirname "$TUNNEL_LOG")"
: > "$TUNNEL_LOG"
exec > >(tee -a "$TUNNEL_LOG") 2>&1

# TUNNEL_NAME: how the machine shows up in vscode.dev/tunnel/<name> (max 20 chars)
exec code tunnel --accept-server-license-terms --name "${TUNNEL_NAME:-claude-pod}"
