# agent-voice — voice satellite server for ESPHome voice_assistant devices.
# Talks the ESPHome native API directly (the role HA normally plays), runs
# STT/TTS through Wyoming services, and routes utterances by wake word to the
# agent gateway (MCP) or Home Assistant. See README.md.

FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    LANG=C.UTF-8

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app/ app/

RUN useradd --create-home --uid 1000 agent
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

EXPOSE 8100

CMD ["python", "-m", "app.main"]
