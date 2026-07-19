# claude-pod — always-on agent body for a Kubernetes pod.
# VS Code tunnel (outbound-only) + Claude Code CLI + the day-to-day tools an
# agent needs (git, ripgrep, jq). No inbound port: the tunnel dials out.
#
# All state that must survive restarts lives on mounted volumes:
#   /home/agent/.claude      Claude Code sessions + credentials
#   /home/agent/.vscode-cli  tunnel auth token
#   /workspace               the agent's working repo

# --- Fetch stage: VS Code CLI (standalone `code` binary) -------------------
FROM debian:bookworm-slim AS vscode-cli

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*

ARG TARGETARCH
RUN case "${TARGETARCH}" in \
        amd64) VSCODE_ARCH=x64 ;; \
        arm64) VSCODE_ARCH=arm64 ;; \
        *) echo "unsupported arch: ${TARGETARCH}" >&2; exit 1 ;; \
    esac \
    && curl -fsSL "https://update.code.visualstudio.com/latest/cli-linux-${VSCODE_ARCH}/stable" \
       -o /tmp/vscode-cli.tar.gz \
    && tar -xzf /tmp/vscode-cli.tar.gz -C /usr/local/bin code \
    && chmod +x /usr/local/bin/code

# --- Runtime ----------------------------------------------------------------
FROM node:22-bookworm-slim

ENV LANG=C.UTF-8 \
    # never self-update inside an immutable image; new versions ship as new tags
    DISABLE_AUTOUPDATER=1

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ca-certificates \
        curl \
        git \
        jq \
        less \
        openssh-client \
        procps \
        ripgrep \
        tini \
    && rm -rf /var/lib/apt/lists/*

RUN npm install -g @anthropic-ai/claude-code \
    && npm cache clean --force

# Google Workspace MCP server (stdio) in its own venv — same pinned version
# as agent-gw so both containers spawn identical tools from .mcp.json.
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 python3-venv \
    && rm -rf /var/lib/apt/lists/* \
    && python3 -m venv /opt/workspace-mcp \
    && /opt/workspace-mcp/bin/pip install --no-cache-dir workspace-mcp==1.22.0 \
    && ln -s /opt/workspace-mcp/bin/workspace-mcp /usr/local/bin/workspace-mcp

COPY --from=vscode-cli /usr/local/bin/code /usr/local/bin/code

# rosetta-bridge: stdio->HTTP MCP relay to the rosetta hub, spawned by the
# workspace .mcp.json. Stdlib-only on purpose: the bare python3 above suffices,
# no venv to keep in sync. Token lifecycle (client_credentials) lives inside.
# Identical copy in agent-gw — both containers spawn the same tools.
COPY --chmod=755 rosetta-bridge /usr/local/bin/rosetta-bridge

# Rename the stock `node` user (uid 1000) — this pod hosts an agent, not a build
RUN usermod -l agent -d /home/agent -m node \
    && groupmod -n agent node \
    && mkdir -p /workspace \
    && chown agent:agent /workspace

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

USER agent
WORKDIR /workspace

ENTRYPOINT ["/usr/bin/tini", "--", "/entrypoint.sh"]
