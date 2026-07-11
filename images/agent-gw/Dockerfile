# agent-gw — mobile chat gateway for a Claude Code agent pod.
# FastAPI server + PWA frontend; routes each message to the Claude Agent SDK
# (query() with per-channel session resume, cwd=/workspace).
#
# Auth model: subscription OAuth token via CLAUDE_CODE_OAUTH_TOKEN.
# NEVER set ANTHROPIC_API_KEY in this image or its pod — it silently
# overrides the subscription token and bills API credits instead.

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

RUN useradd --create-home --uid 1000 agent \
    && mkdir -p /workspace \
    && chown agent:agent /workspace

USER agent

EXPOSE 8000

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
