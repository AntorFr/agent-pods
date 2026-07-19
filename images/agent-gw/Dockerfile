# agent-gw — mobile chat gateway for a Claude Code agent pod.
# FastAPI server + PWA frontend; routes each message to the Claude Agent SDK
# (query() with per-channel session resume, cwd=/workspace).
#
# Auth model: subscription OAuth token via CLAUDE_CODE_OAUTH_TOKEN.
# NEVER set ANTHROPIC_API_KEY in this image or its pod — it silently
# overrides the subscription token and bills API credits instead.

# --- Frontend build stage: bundle the Markdoc content engine (browser IIFE) ---
FROM node:22-bookworm-slim AS frontend
WORKDIR /fe
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build
# -> /fe/dist/engine.js

# --- Runtime ---
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    LANG=C.UTF-8 \
    DISABLE_AUTOUPDATER=1

# Node is required by the Claude Agent SDK (it drives the Claude Code CLI);
# git because the agent commits its memory writes.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ca-certificates \
        curl \
        git \
        nodejs \
        npm \
        ripgrep \
        tini \
    && rm -rf /var/lib/apt/lists/*

RUN npm install -g @anthropic-ai/claude-code \
    && npm cache clean --force

WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app
# Serveurs MCP stdio bundlés (maps/weather), lancés par le .mcp.json du workspace.
# DEPRECATED : remplacés par le hub rosetta (via rosetta-bridge) — à retirer,
# avec leurs clés d'API dans l'env du pod, une fois la bascule vérifiée en prod.
COPY mcp_servers ./mcp_servers
# rosetta-bridge : relais stdio->HTTP vers le hub rosetta (refresh de token
# client_credentials intégré, stdlib seule). Copie identique dans claude-pod.
COPY --chmod=755 rosetta-bridge /usr/local/bin/rosetta-bridge
# Bundled content engine + launcher shell (built once, never at runtime).
COPY --from=frontend /fe/dist/engine.js /fe/dist/engine.css /fe/dist/launcher.js /fe/dist/launcher.css ./app/static/

RUN useradd --create-home --uid 1000 agent \
    && mkdir -p /workspace \
    && chown agent:agent /workspace

USER agent

EXPOSE 8000

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
