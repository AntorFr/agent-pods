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

# Version de l'image, injectée par la CI (metadata-action). Sert uniquement à
# l'affichage dans les Réglages de la PWA : savoir quelle version tourne sans
# aller lire le manifeste k8s. `dev` sur un build local sans --build-arg.
ARG VERSION=dev
ENV GW_VERSION=${VERSION}

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

# kubectl — diagnostic cluster pour les corps qui en ont le droit. Le binaire ne
# donne AUCUN accès par lui-même : tout dépend du ServiceAccount monté et de son
# RBAC (lecture seule, secrets exclus, pour le pod skippy). Un pod sans SA dédié
# ne peut rien en faire. TARGETARCH vient de buildx : l'image est multi-arch, et
# figer amd64 ici donnerait un binaire mort sur arm64.
ARG TARGETARCH
RUN set -eux; \
    ver="$(curl -fsSL https://dl.k8s.io/release/stable.txt)"; \
    curl -fsSLo /usr/local/bin/kubectl \
        "https://dl.k8s.io/release/${ver}/bin/linux/${TARGETARCH}/kubectl"; \
    chmod 0755 /usr/local/bin/kubectl; \
    kubectl version --client=true --output=yaml >/dev/null

WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app
# Contrats de FORMAT livrés par l'image, un dossier de plugin Claude Code par
# module (`--plugin-dir`, via ClaudeAgentOptions.plugins). Ils descendent avec le
# code qui les lit, donc ils ne peuvent pas dériver de lui : c'est tout l'objet.
# ⚠️ `app/main.py` les cherche en `<parent de app>/plugins` — cette copie n'est PAS
# optionnelle, sans elle aucun contrat ne part et personne ne s'en plaint.
COPY plugins ./plugins
# rosetta-bridge : relais stdio->HTTP vers le hub rosetta (refresh de token
# client_credentials intégré, stdlib seule). Copie identique dans claude-pod.
COPY --chmod=755 rosetta-bridge /usr/local/bin/rosetta-bridge
# memory-sync : écriture mémoire MULTI-AUTEUR (pull-rebase / commit / push-retry,
# conflit remonté jamais deviné). Configure son helper git depuis $GITHUB_TOKEN.
COPY --chmod=755 memory-sync /usr/local/bin/memory-sync
# trace-geom : calcule la trace d'un parcours (hub rosetta, addon `trace`) et
# l'écrit dans son .parcours.json. La géométrie va du hub au disque sans passer
# par la conversation — 328 points recopiés par un modèle, c'est une trace fausse.
COPY --chmod=755 trace-geom /usr/local/bin/trace-geom
# git-credential-rosetta : le pod pousse vers le hub (addon `git`) et ne detient
# aucun credential GitHub. Le helper est la SEULE source du jeton, donc l'endroit
# ou se decide si un push part : canal + bouclier PWA, comme google_guard.py. Le
# nom compte — `credential.helper rosetta` fait chercher git-credential-rosetta.
COPY --chmod=755 git-credential-rosetta /usr/local/bin/git-credential-rosetta
# Bundled content engine + launcher shell (built once, never at runtime).
# scan.js is the barcode decoder FALLBACK, deliberately a bundle of its own: it
# weighs 116 kB gzipped and is fetched only when the browser has no
# BarcodeDetector (iOS Safari, Firefox). Folding it into launcher.js would bill
# every single page load for a feature most sessions never open.
COPY --from=frontend /fe/dist/engine.js /fe/dist/engine.css /fe/dist/launcher.js /fe/dist/launcher.css /fe/dist/scan.js ./app/static/
# Le CLI atelier (valide/migre + les règles 3.0) descend dans le plugin : Alfred valide
# et migre avec EXACTEMENT le code que l'établi exécute (cf. ATELIER-3.md D4).
COPY --from=frontend /fe/dist/atelier.mjs ./plugins/atelier/tools/atelier.mjs

RUN useradd --create-home --uid 1000 agent \
    && mkdir -p /workspace \
    && chown agent:agent /workspace

# ⚠️ HOME EXPLICITE — pas une redondance.
# Le compte `agent` porte l'uid 1000, mais un pod peut tourner sous un TOUT AUTRE
# uid (`runAsUser`) : celui d'une personne réelle, venu d'un annuaire, absent de
# l'/etc/passwd de cette image. Sans entrée passwd, $HOME n'est pas résolu et vaut
# « / » — tout ce qui écrit sous le home part alors à la racine, en lecture seule.
# Vécu le 2026-08-03 : `could not lock config file //.gitconfig` (le double slash
# est la signature), et surtout une gateway qui démarre NORMALEMENT pour ne casser
# qu'au premier tour d'agent, sur ~/.claude. Une ligne ici évite de devoir y penser
# dans chaque manifeste.
ENV HOME=/home/agent

USER agent

EXPOSE 8000

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
