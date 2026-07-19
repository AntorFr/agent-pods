# alfred-voice — voice satellite server for ESPHome voice_assistant devices.
# Talks the ESPHome native API directly (the role HA normally plays), runs
# STT/TTS through Wyoming services, and routes utterances by wake word to the
# Alfred gateway (MCP) or Home Assistant. See README.md.

FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    LANG=C.UTF-8

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app/ app/

RUN useradd --create-home --uid 1000 agent
USER agent

EXPOSE 8100

CMD ["python", "-m", "app.main"]
