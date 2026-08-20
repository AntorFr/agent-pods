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
    DISABLE_AUTOUPDATER=1 \
    # Aucun terminal dans ce pod : sans ce garde-fou, un git privé de credential
    # essaie d'INVITER à saisir un mot de passe, et l'invite ne devient pas une
    # erreur — elle devient un blocage silencieux. On veut l'échec, tout de suite.
    GIT_TERMINAL_PROMPT=0

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
# Les PLUGINS — tout ce qui étend un agent sans toucher au corps : contrats de
# format (skills Claude Code), API, exécutables. Le corps les découvre par leur
# manifeste ; il n'en connaît aucun par son nom. Contrat : plugins/README.md.
# ⚠️ `app/plugins.py` les cherche en `<parent de app>/plugins` — cette copie n'est
# PAS optionnelle, sans elle aucun contrat ne part et personne ne s'en plaint.
COPY plugins ./plugins
# Les exécutables des plugins vont sur le PATH, sans qu'aucun nom n'apparaisse ici :
# un plugin déposé depuis un autre dépôt est servi par la même ligne. Sans condition,
# et ce n'est pas un trou dans le gating — le Dockerfile ne connaît pas l'env du pod,
# et un binaire est INERTE tant que rien ne l'appelle. C'est le `setup` du plugin qui
# le câble, et lui ne tourne que si le plugin est actif.
RUN set -eu; \
    for f in ./plugins/*/bin/*; do \
        [ -f "$f" ] || continue; \
        install -m 0755 "$f" /usr/local/bin/; \
    done
# Les exécutables DU CORPS, par opposition à ceux des plugins juste au-dessus. La
# symétrie est voulue : `bin/` à la racine d'une image = ce que tout corps possède,
# `plugins/<id>/bin/` = ce qu'un plugin apporte. Là où un binaire est rangé dit donc
# s'il est optionnel, sans avoir à le savoir par ailleurs.
#
#   mcp-bridge      relais stdio->HTTP vers le hub MCP (refresh de token
#                   client_credentials intégré, stdlib seule). Tout agent parle au
#                   hub — c'est par lui qu'arrivent TOUS ses outils MCP.
#                   ⚠️ Copie octet pour octet dans claude-pod, vérifiée par
#                   `test/bin_test.py` : les deux conteneurs doivent lancer le même
#                   relais, et un commentaire ne garantissait rien.
#
#   instruction-sync  boucle pull-rebase / commit / push des INSTRUCTIONS du corps
#                   (CLAUDE.md, DECISIONS.md, .claude/, planif/) — versionnées et
#                   co-éditées par le pod ET la machine de dev. Conflit REMONTÉ,
#                   jamais deviné. Helper git scopé sur github.com.
#                   ⚠️ Refuse de tourner si `memory/` est redevenu suivi par git :
#                   c'est un point de montage NFS, un pull l'effacerait.
#
# ⚠️ `memory-sync` vivait ici jusqu'au 2026-08-20 — RETIRÉ, à ne pas réintroduire.
# `instruction-sync` n'est PAS son retour déguisé : en le supprimant on a vu que sa
# justification n'avait jamais été la mémoire mais la CO-ÉDITION, laquelle a
# simplement changé d'objet. La mémoire, elle, a un seul écrivain et vit hors de git
# (filet ZFS) : écrire un fait, c'est écrire un fichier, il n'y a rien à
# synchroniser. Les instructions, elles, ont deux auteurs et un `origin`.
COPY --chmod=755 bin/ /usr/local/bin/
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
